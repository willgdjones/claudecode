use anyhow::Result;
use chrono::Utc;
use tracing::debug;

use crate::types::{DataPoint, ExternalData, Market, MarketCategory};

pub struct SportsSource {
    client: reqwest::Client,
}

impl SportsSource {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    /// Fetch sports data relevant to a market
    pub async fn fetch(&self, market: &Market) -> Result<ExternalData> {
        let mut data_points = Vec::new();

        // Use free odds API for market data
        match self.fetch_odds(&market.question).await {
            Ok(points) => data_points.extend(points),
            Err(e) => debug!("Odds API fetch failed: {}", e),
        }

        // Scrape publicly available injury reports
        match self.fetch_injury_data(&market.question).await {
            Ok(points) => data_points.extend(points),
            Err(e) => debug!("Injury data fetch failed: {}", e),
        }

        Ok(ExternalData {
            source: "Sports data (odds, injuries)".to_string(),
            category: MarketCategory::Sports,
            summary: format!(
                "Sports data for: {}. {} data points.",
                market.question,
                data_points.len()
            ),
            data_points,
            fetched_at: Utc::now(),
        })
    }

    async fn fetch_odds(&self, _question: &str) -> Result<Vec<DataPoint>> {
        // The Odds API (free tier: 500 requests/month)
        let url = "https://api.the-odds-api.com/v4/sports/?apiKey=DEMO_KEY";

        let resp = self.client.get(url).send().await;

        match resp {
            Ok(r) if r.status().is_success() => {
                let body: serde_json::Value = r.json().await?;
                let mut points = Vec::new();

                if let Some(sports) = body.as_array() {
                    for sport in sports.iter().take(10) {
                        let title = sport["title"].as_str().unwrap_or("unknown");
                        let active = sport["active"].as_bool().unwrap_or(false);
                        if active {
                            points.push(DataPoint {
                                label: format!("Active sport: {}", title),
                                value: "In season".to_string(),
                                relevance: 0.4,
                            });
                        }
                    }
                }

                Ok(points)
            }
            _ => Ok(Vec::new()),
        }
    }

    async fn fetch_injury_data(&self, question: &str) -> Result<Vec<DataPoint>> {
        // Extract team/player names from the market question for targeted search
        // This is a simplified version — in production you'd use more sophisticated NLP
        let keywords: Vec<&str> = question
            .split_whitespace()
            .filter(|w| w.len() > 3 && w.chars().next().map(|c| c.is_uppercase()).unwrap_or(false))
            .take(5)
            .collect();

        let mut points = Vec::new();

        // Use ESPN's public API endpoints for injury data
        let url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";

        match self.client.get(url).send().await {
            Ok(resp) if resp.status().is_success() => {
                let body: serde_json::Value = resp.json().await.unwrap_or_default();

                if let Some(teams) = body.as_array() {
                    for team in teams.iter().take(5) {
                        if let Some(injuries) = team["injuries"].as_array() {
                            for injury in injuries.iter().take(3) {
                                let name = injury["athlete"]["displayName"]
                                    .as_str()
                                    .unwrap_or("Unknown");
                                let status =
                                    injury["status"].as_str().unwrap_or("Unknown");

                                // Check if this injury is relevant to our market
                                let relevant = keywords
                                    .iter()
                                    .any(|k| name.contains(k) || question.contains(name));

                                if relevant {
                                    points.push(DataPoint {
                                        label: format!("Injury: {}", name),
                                        value: status.to_string(),
                                        relevance: 0.9,
                                    });
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }

        Ok(points)
    }
}
