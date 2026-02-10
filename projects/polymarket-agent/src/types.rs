use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ── Polymarket Market Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Market {
    pub condition_id: String,
    pub question: String,
    pub description: String,
    pub market_slug: String,
    pub outcomes: Vec<String>,
    pub outcome_prices: Vec<f64>,
    pub volume: f64,
    pub liquidity: f64,
    pub end_date: Option<DateTime<Utc>>,
    pub category: MarketCategory,
    pub active: bool,
    pub closed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenInfo {
    pub token_id: String,
    pub outcome: String,
    pub price: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MarketCategory {
    Weather,
    Sports,
    Crypto,
    Politics,
    Science,
    Entertainment,
    Other,
}

impl MarketCategory {
    pub fn from_tags(tags: &[String], question: &str) -> Self {
        let q = question.to_lowercase();
        let all_text: String = tags
            .iter()
            .map(|t| t.to_lowercase())
            .collect::<Vec<_>>()
            .join(" ");
        let combined = format!("{all_text} {q}");

        if combined.contains("weather")
            || combined.contains("temperature")
            || combined.contains("hurricane")
            || combined.contains("tornado")
            || combined.contains("rainfall")
            || combined.contains("noaa")
        {
            MarketCategory::Weather
        } else if combined.contains("nfl")
            || combined.contains("nba")
            || combined.contains("mlb")
            || combined.contains("soccer")
            || combined.contains("football")
            || combined.contains("basketball")
            || combined.contains("baseball")
            || combined.contains("tennis")
            || combined.contains("ufc")
            || combined.contains("sport")
            || combined.contains("injury")
        {
            MarketCategory::Sports
        } else if combined.contains("bitcoin")
            || combined.contains("ethereum")
            || combined.contains("crypto")
            || combined.contains("btc")
            || combined.contains("eth")
            || combined.contains("defi")
            || combined.contains("blockchain")
            || combined.contains("token")
        {
            MarketCategory::Crypto
        } else if combined.contains("election")
            || combined.contains("president")
            || combined.contains("congress")
            || combined.contains("senate")
            || combined.contains("politic")
            || combined.contains("vote")
        {
            MarketCategory::Politics
        } else if combined.contains("science")
            || combined.contains("research")
            || combined.contains("study")
        {
            MarketCategory::Science
        } else if combined.contains("movie")
            || combined.contains("oscar")
            || combined.contains("grammy")
            || combined.contains("entertainment")
            || combined.contains("celebrity")
        {
            MarketCategory::Entertainment
        } else {
            MarketCategory::Other
        }
    }
}

// ── Analysis Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FairValueEstimate {
    /// Agent's estimated true probability for the YES outcome
    pub probability: f64,
    /// Confidence in the estimate (0.0 - 1.0)
    pub confidence: f64,
    /// Reasoning summary from Claude
    pub reasoning: String,
    /// Key data points used
    pub data_points: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradingOpportunity {
    pub market: Market,
    pub fair_value: FairValueEstimate,
    /// The edge: difference between fair value and market price
    pub edge: f64,
    /// Which side to buy (YES or NO)
    pub side: TradeSide,
    /// Market price we're comparing against
    pub market_price: f64,
    /// Kelly-optimal position size in USDC
    pub position_size: f64,
    /// Expected value of the trade
    pub expected_value: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TradeSide {
    Yes,
    No,
}

impl std::fmt::Display for TradeSide {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TradeSide::Yes => write!(f, "YES"),
            TradeSide::No => write!(f, "NO"),
        }
    }
}

// ── Order Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    pub id: String,
    pub market_condition_id: String,
    pub token_id: String,
    pub side: TradeSide,
    pub price: f64,
    pub size: f64,
    pub status: OrderStatus,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderStatus {
    Pending,
    Filled,
    PartiallyFilled,
    Cancelled,
    Failed,
}

// ── Position Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub market_condition_id: String,
    pub market_question: String,
    pub side: TradeSide,
    pub entry_price: f64,
    pub size: f64,
    pub current_price: f64,
    pub unrealized_pnl: f64,
    pub opened_at: DateTime<Utc>,
}

// ── Agent State ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentState {
    /// Current USDC balance
    pub bankroll: f64,
    /// Starting bankroll for tracking PnL
    pub initial_bankroll: f64,
    /// Total realized PnL
    pub realized_pnl: f64,
    /// Total API costs incurred
    pub total_api_costs: f64,
    /// Number of trades executed
    pub trades_executed: u64,
    /// Number of winning trades
    pub winning_trades: u64,
    /// Number of scan cycles completed
    pub cycles_completed: u64,
    /// Open positions
    pub positions: Vec<Position>,
    /// Trade history
    pub trade_history: Vec<TradeRecord>,
    /// When the agent started
    pub started_at: DateTime<Utc>,
    /// Last cycle time
    pub last_cycle_at: Option<DateTime<Utc>>,
}

impl AgentState {
    pub fn new(initial_bankroll: f64) -> Self {
        Self {
            bankroll: initial_bankroll,
            initial_bankroll,
            realized_pnl: 0.0,
            total_api_costs: 0.0,
            trades_executed: 0,
            winning_trades: 0,
            cycles_completed: 0,
            positions: Vec::new(),
            trade_history: Vec::new(),
            started_at: Utc::now(),
            last_cycle_at: None,
        }
    }

    pub fn is_alive(&self) -> bool {
        self.bankroll > 0.0
    }

    pub fn win_rate(&self) -> f64 {
        if self.trades_executed == 0 {
            return 0.0;
        }
        self.winning_trades as f64 / self.trades_executed as f64
    }

    pub fn net_pnl(&self) -> f64 {
        self.realized_pnl - self.total_api_costs
    }

    pub fn roi(&self) -> f64 {
        if self.initial_bankroll == 0.0 {
            return 0.0;
        }
        self.net_pnl() / self.initial_bankroll * 100.0
    }

    pub fn deduct_api_cost(&mut self, cost: f64) {
        self.total_api_costs += cost;
        self.bankroll -= cost;
    }

    pub fn save(&self, path: &str) -> anyhow::Result<()> {
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json)?;
        Ok(())
    }

    pub fn load(path: &str) -> anyhow::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        Ok(serde_json::from_str(&content)?)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeRecord {
    pub market_question: String,
    pub condition_id: String,
    pub side: TradeSide,
    pub entry_price: f64,
    pub exit_price: Option<f64>,
    pub size: f64,
    pub pnl: Option<f64>,
    pub reasoning: String,
    pub opened_at: DateTime<Utc>,
    pub closed_at: Option<DateTime<Utc>>,
}

// ── Data Source Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalData {
    pub source: String,
    pub category: MarketCategory,
    pub summary: String,
    pub data_points: Vec<DataPoint>,
    pub fetched_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataPoint {
    pub label: String,
    pub value: String,
    pub relevance: f64,
}
