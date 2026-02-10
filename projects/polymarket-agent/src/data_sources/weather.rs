use anyhow::{Context, Result};
use chrono::Utc;
use tracing::debug;

use crate::types::{DataPoint, ExternalData, Market, MarketCategory};

pub struct WeatherSource {
    client: reqwest::Client,
    api_token: Option<String>,
}

impl WeatherSource {
    pub fn new(api_token: Option<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_token,
        }
    }

    /// Fetch weather data relevant to a market
    pub async fn fetch(&self, market: &Market) -> Result<ExternalData> {
        let mut data_points = Vec::new();

        // Try NOAA API for US weather data
        if let Some(ref token) = self.api_token {
            match self.fetch_noaa(token, &market.question).await {
                Ok(points) => data_points.extend(points),
                Err(e) => debug!("NOAA fetch failed: {}", e),
            }
        }

        // Try Open-Meteo (free, no API key required) as fallback
        match self.fetch_open_meteo(&market.question).await {
            Ok(points) => data_points.extend(points),
            Err(e) => debug!("Open-Meteo fetch failed: {}", e),
        }

        Ok(ExternalData {
            source: "Weather APIs (NOAA / Open-Meteo)".to_string(),
            category: MarketCategory::Weather,
            summary: format!(
                "Weather data for market: {}. {} data points collected.",
                market.question,
                data_points.len()
            ),
            data_points,
            fetched_at: Utc::now(),
        })
    }

    async fn fetch_noaa(&self, token: &str, _question: &str) -> Result<Vec<DataPoint>> {
        // NOAA Climate Data Online API
        // Fetch recent observations and forecasts
        let url = "https://www.ncdc.noaa.gov/cdo-web/api/v2/data";

        let resp = self
            .client
            .get(url)
            .header("token", token)
            .query(&[
                ("datasetid", "GHCND"),
                ("limit", "10"),
                ("sortfield", "date"),
                ("sortorder", "desc"),
            ])
            .send()
            .await
            .context("NOAA API request failed")?;

        if !resp.status().is_success() {
            anyhow::bail!("NOAA API returned {}", resp.status());
        }

        let body: serde_json::Value = resp.json().await?;

        let mut points = Vec::new();
        if let Some(results) = body["results"].as_array() {
            for result in results.iter().take(5) {
                let datatype = result["datatype"].as_str().unwrap_or("unknown");
                let value = result["value"].as_f64().unwrap_or(0.0);
                let date = result["date"].as_str().unwrap_or("unknown");

                points.push(DataPoint {
                    label: format!("NOAA {} ({})", datatype, date),
                    value: format!("{}", value),
                    relevance: 0.7,
                });
            }
        }

        Ok(points)
    }

    async fn fetch_open_meteo(&self, _question: &str) -> Result<Vec<DataPoint>> {
        // Open-Meteo free weather API - get US-wide forecast summary
        // Default to NYC coordinates as a baseline
        let url = "https://api.open-meteo.com/v1/forecast\
            ?latitude=40.71&longitude=-74.01\
            &daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max\
            &timezone=America/New_York\
            &forecast_days=7";

        let resp = self
            .client
            .get(url)
            .send()
            .await
            .context("Open-Meteo request failed")?;

        if !resp.status().is_success() {
            anyhow::bail!("Open-Meteo returned {}", resp.status());
        }

        let body: serde_json::Value = resp.json().await?;
        let mut points = Vec::new();

        if let Some(daily) = body.get("daily") {
            if let (Some(dates), Some(max_temps)) = (
                daily["time"].as_array(),
                daily["temperature_2m_max"].as_array(),
            ) {
                for (date, temp) in dates.iter().zip(max_temps.iter()).take(7) {
                    points.push(DataPoint {
                        label: format!(
                            "Forecast high {}",
                            date.as_str().unwrap_or("?")
                        ),
                        value: format!("{}°C", temp.as_f64().unwrap_or(0.0)),
                        relevance: 0.6,
                    });
                }
            }

            if let Some(precip) = daily["precipitation_sum"].as_array() {
                for (i, p) in precip.iter().enumerate().take(3) {
                    points.push(DataPoint {
                        label: format!("Precipitation day +{}", i),
                        value: format!("{}mm", p.as_f64().unwrap_or(0.0)),
                        relevance: 0.5,
                    });
                }
            }
        }

        Ok(points)
    }
}
