use anyhow::{Context, Result};
use chrono::Utc;
use tracing::debug;

use crate::types::{DataPoint, ExternalData, Market, MarketCategory};

pub struct CryptoSource {
    client: reqwest::Client,
}

impl CryptoSource {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    /// Fetch crypto data relevant to a market
    pub async fn fetch(&self, market: &Market) -> Result<ExternalData> {
        let mut data_points = Vec::new();

        // Fetch price data from CoinGecko (free, no API key)
        match self.fetch_prices().await {
            Ok(points) => data_points.extend(points),
            Err(e) => debug!("CoinGecko fetch failed: {}", e),
        }

        // Fetch Fear & Greed index
        match self.fetch_fear_greed().await {
            Ok(points) => data_points.extend(points),
            Err(e) => debug!("Fear & Greed fetch failed: {}", e),
        }

        // Fetch on-chain metrics from public APIs
        match self.fetch_onchain_metrics().await {
            Ok(points) => data_points.extend(points),
            Err(e) => debug!("On-chain metrics fetch failed: {}", e),
        }

        Ok(ExternalData {
            source: "Crypto data (CoinGecko, on-chain, sentiment)".to_string(),
            category: MarketCategory::Crypto,
            summary: format!(
                "Crypto market data for: {}. {} data points.",
                market.question,
                data_points.len()
            ),
            data_points,
            fetched_at: Utc::now(),
        })
    }

    async fn fetch_prices(&self) -> Result<Vec<DataPoint>> {
        let url = "https://api.coingecko.com/api/v3/simple/price\
            ?ids=bitcoin,ethereum,solana\
            &vs_currencies=usd\
            &include_24hr_change=true\
            &include_market_cap=true";

        let resp = self
            .client
            .get(url)
            .send()
            .await
            .context("CoinGecko request failed")?;

        if !resp.status().is_success() {
            anyhow::bail!("CoinGecko returned {}", resp.status());
        }

        let body: serde_json::Value = resp.json().await?;
        let mut points = Vec::new();

        for coin in ["bitcoin", "ethereum", "solana"] {
            if let Some(data) = body.get(coin) {
                if let Some(price) = data["usd"].as_f64() {
                    points.push(DataPoint {
                        label: format!("{} price", coin),
                        value: format!("${:.2}", price),
                        relevance: 0.8,
                    });
                }
                if let Some(change) = data["usd_24h_change"].as_f64() {
                    points.push(DataPoint {
                        label: format!("{} 24h change", coin),
                        value: format!("{:.2}%", change),
                        relevance: 0.7,
                    });
                }
                if let Some(mcap) = data["usd_market_cap"].as_f64() {
                    points.push(DataPoint {
                        label: format!("{} market cap", coin),
                        value: format!("${:.0}", mcap),
                        relevance: 0.5,
                    });
                }
            }
        }

        Ok(points)
    }

    async fn fetch_fear_greed(&self) -> Result<Vec<DataPoint>> {
        let url = "https://api.alternative.me/fng/?limit=3";

        let resp = self.client.get(url).send().await?;

        if !resp.status().is_success() {
            return Ok(Vec::new());
        }

        let body: serde_json::Value = resp.json().await?;
        let mut points = Vec::new();

        if let Some(data) = body["data"].as_array() {
            for entry in data.iter().take(3) {
                let value = entry["value"].as_str().unwrap_or("50");
                let classification = entry["value_classification"]
                    .as_str()
                    .unwrap_or("Neutral");

                points.push(DataPoint {
                    label: "Crypto Fear & Greed".to_string(),
                    value: format!("{} ({})", value, classification),
                    relevance: 0.6,
                });
            }
        }

        Ok(points)
    }

    async fn fetch_onchain_metrics(&self) -> Result<Vec<DataPoint>> {
        // Use blockchain.info for basic BTC on-chain data (free, no auth)
        let mut points = Vec::new();

        // Hash rate
        let url = "https://api.blockchain.info/stats";
        match self.client.get(url).send().await {
            Ok(resp) if resp.status().is_success() => {
                let body: serde_json::Value = resp.json().await.unwrap_or_default();

                if let Some(hash_rate) = body["hash_rate"].as_f64() {
                    points.push(DataPoint {
                        label: "BTC hash rate".to_string(),
                        value: format!("{:.2} TH/s", hash_rate / 1_000_000.0),
                        relevance: 0.4,
                    });
                }

                if let Some(difficulty) = body["difficulty"].as_f64() {
                    points.push(DataPoint {
                        label: "BTC difficulty".to_string(),
                        value: format!("{:.2}T", difficulty / 1_000_000_000_000.0),
                        relevance: 0.3,
                    });
                }

                if let Some(n_tx) = body["n_tx"].as_u64() {
                    points.push(DataPoint {
                        label: "BTC daily transactions".to_string(),
                        value: format!("{}", n_tx),
                        relevance: 0.4,
                    });
                }
            }
            _ => {}
        }

        Ok(points)
    }
}
