pub mod crypto;
pub mod sports;
pub mod weather;

use anyhow::Result;
use tracing::debug;

use crate::config::DataSourcesConfig;
use crate::types::{ExternalData, Market, MarketCategory};

use self::crypto::CryptoSource;
use self::sports::SportsSource;
use self::weather::WeatherSource;

pub struct DataSourceManager {
    weather: Option<WeatherSource>,
    sports: Option<SportsSource>,
    crypto: Option<CryptoSource>,
}

impl DataSourceManager {
    pub fn new(config: &DataSourcesConfig) -> Self {
        Self {
            weather: if config.enable_weather {
                Some(WeatherSource::new(config.noaa_api_token.clone()))
            } else {
                None
            },
            sports: if config.enable_sports {
                Some(SportsSource::new())
            } else {
                None
            },
            crypto: if config.enable_crypto {
                Some(CryptoSource::new())
            } else {
                None
            },
        }
    }

    /// Fetch external data relevant to a specific market
    pub async fn fetch_for_market(&self, market: &Market) -> Result<Vec<ExternalData>> {
        let mut data = Vec::new();

        match market.category {
            MarketCategory::Weather => {
                if let Some(ref source) = self.weather {
                    match source.fetch(market).await {
                        Ok(d) => data.push(d),
                        Err(e) => debug!("Weather data fetch failed: {}", e),
                    }
                }
            }
            MarketCategory::Sports => {
                if let Some(ref source) = self.sports {
                    match source.fetch(market).await {
                        Ok(d) => data.push(d),
                        Err(e) => debug!("Sports data fetch failed: {}", e),
                    }
                }
            }
            MarketCategory::Crypto => {
                if let Some(ref source) = self.crypto {
                    match source.fetch(market).await {
                        Ok(d) => data.push(d),
                        Err(e) => debug!("Crypto data fetch failed: {}", e),
                    }
                }
            }
            // For other categories, we still try to get general data
            _ => {
                // Try crypto data as it has general market sentiment
                if let Some(ref source) = self.crypto {
                    match source.fetch(market).await {
                        Ok(d) => data.push(d),
                        Err(e) => debug!("General crypto data fetch failed: {}", e),
                    }
                }
            }
        }

        Ok(data)
    }
}
