use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub polymarket: PolymarketConfig,
    pub claude: ClaudeConfig,
    pub trading: TradingConfig,
    pub data_sources: DataSourcesConfig,
    pub agent: AgentConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolymarketConfig {
    /// Polymarket CLOB API base URL
    pub api_url: String,
    /// API key for authentication
    pub api_key: String,
    /// API secret for signing
    pub api_secret: String,
    /// API passphrase
    pub api_passphrase: String,
    /// Chain ID (137 for Polygon mainnet)
    pub chain_id: u64,
    /// Private key for signing transactions
    pub private_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeConfig {
    /// Anthropic API key (agent pays for this from profits)
    pub api_key: String,
    /// Model to use for reasoning
    pub model: String,
    /// Max tokens per reasoning call
    pub max_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradingConfig {
    /// Minimum mispricing threshold to trigger a trade (e.g., 0.08 = 8%)
    pub min_edge: f64,
    /// Maximum fraction of bankroll per position (Kelly fraction cap)
    pub max_position_fraction: f64,
    /// Kelly fraction multiplier (use fractional Kelly for safety, e.g., 0.5)
    pub kelly_fraction: f64,
    /// Minimum bankroll to stay alive (USDC)
    pub min_bankroll: f64,
    /// Scan interval in seconds
    pub scan_interval_secs: u64,
    /// Maximum number of open positions
    pub max_open_positions: usize,
    /// Minimum market liquidity to consider (USDC)
    pub min_liquidity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSourcesConfig {
    /// NOAA API token for weather data
    pub noaa_api_token: Option<String>,
    /// Enable weather market analysis
    pub enable_weather: bool,
    /// Enable sports market analysis
    pub enable_sports: bool,
    /// Enable crypto market analysis
    pub enable_crypto: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    /// Running cost tracking: estimated API cost per reasoning call (USD)
    pub estimated_cost_per_call: f64,
    /// Log level
    pub log_level: String,
    /// State file path for persistence across restarts
    pub state_file: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        Ok(Config {
            polymarket: PolymarketConfig {
                api_url: env_or("POLYMARKET_API_URL", "https://clob.polymarket.com"),
                api_key: env_required("POLYMARKET_API_KEY")?,
                api_secret: env_required("POLYMARKET_API_SECRET")?,
                api_passphrase: env_required("POLYMARKET_API_PASSPHRASE")?,
                chain_id: env_or("POLYMARKET_CHAIN_ID", "137")
                    .parse()
                    .context("Invalid chain ID")?,
                private_key: env_required("POLYMARKET_PRIVATE_KEY")?,
            },
            claude: ClaudeConfig {
                api_key: env_required("ANTHROPIC_API_KEY")?,
                model: env_or("CLAUDE_MODEL", "claude-sonnet-4-20250514"),
                max_tokens: env_or("CLAUDE_MAX_TOKENS", "1024")
                    .parse()
                    .context("Invalid max tokens")?,
            },
            trading: TradingConfig {
                min_edge: env_or("MIN_EDGE", "0.08")
                    .parse()
                    .context("Invalid min edge")?,
                max_position_fraction: env_or("MAX_POSITION_FRACTION", "0.06")
                    .parse()
                    .context("Invalid max position fraction")?,
                kelly_fraction: env_or("KELLY_FRACTION", "0.5")
                    .parse()
                    .context("Invalid kelly fraction")?,
                min_bankroll: env_or("MIN_BANKROLL", "0.0")
                    .parse()
                    .context("Invalid min bankroll")?,
                scan_interval_secs: env_or("SCAN_INTERVAL_SECS", "600")
                    .parse()
                    .context("Invalid scan interval")?,
                max_open_positions: env_or("MAX_OPEN_POSITIONS", "20")
                    .parse()
                    .context("Invalid max open positions")?,
                min_liquidity: env_or("MIN_LIQUIDITY", "1000.0")
                    .parse()
                    .context("Invalid min liquidity")?,
            },
            data_sources: DataSourcesConfig {
                noaa_api_token: std::env::var("NOAA_API_TOKEN").ok(),
                enable_weather: env_or("ENABLE_WEATHER", "true")
                    .parse()
                    .context("Invalid enable weather")?,
                enable_sports: env_or("ENABLE_SPORTS", "true")
                    .parse()
                    .context("Invalid enable sports")?,
                enable_crypto: env_or("ENABLE_CRYPTO", "true")
                    .parse()
                    .context("Invalid enable crypto")?,
            },
            agent: AgentConfig {
                estimated_cost_per_call: env_or("ESTIMATED_COST_PER_CALL", "0.01")
                    .parse()
                    .context("Invalid estimated cost per call")?,
                log_level: env_or("LOG_LEVEL", "info"),
                state_file: env_or("STATE_FILE", "agent_state.json"),
            },
        })
    }

    pub fn load_or_env(path: Option<&Path>) -> Result<Self> {
        if let Some(path) = path {
            let content = std::fs::read_to_string(path)
                .with_context(|| format!("Failed to read config file: {}", path.display()))?;
            serde_json::from_str(&content).context("Failed to parse config file")
        } else {
            Self::from_env()
        }
    }
}

fn env_required(key: &str) -> Result<String> {
    std::env::var(key).with_context(|| format!("Missing required env var: {key}"))
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}
