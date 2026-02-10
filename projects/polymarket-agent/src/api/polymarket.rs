use anyhow::{Context, Result};
use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::Client;
use sha2::Sha256;
use tracing::{debug, info, warn};

use crate::config::PolymarketConfig;
use crate::types::{Market, MarketCategory, Order, OrderStatus, TradeSide};

type HmacSha256 = Hmac<Sha256>;

pub struct PolymarketClient {
    client: Client,
    config: PolymarketConfig,
}

/// Raw market response from Polymarket CLOB API
#[derive(Debug, serde::Deserialize)]
struct RawMarket {
    condition_id: Option<String>,
    question: Option<String>,
    description: Option<String>,
    market_slug: Option<String>,
    outcomes: Option<serde_json::Value>,
    outcome_prices: Option<serde_json::Value>,
    volume: Option<serde_json::Value>,
    liquidity: Option<serde_json::Value>,
    end_date_iso: Option<String>,
    tags: Option<Vec<String>>,
    active: Option<bool>,
    closed: Option<bool>,
    tokens: Option<Vec<RawToken>>,
}

#[derive(Debug, serde::Deserialize)]
struct RawToken {
    token_id: Option<String>,
    outcome: Option<String>,
    price: Option<f64>,
}

#[derive(Debug, serde::Deserialize)]
struct MarketsResponse {
    data: Option<Vec<RawMarket>>,
    next_cursor: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct OrderResponse {
    #[serde(rename = "orderID")]
    order_id: Option<String>,
    status: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct BalanceResponse {
    balance: Option<String>,
}

impl PolymarketClient {
    pub fn new(config: &PolymarketConfig) -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("Failed to build HTTP client")?;

        Ok(Self {
            client,
            config: config.clone(),
        })
    }

    /// Generate L1 API authentication headers
    fn auth_headers(&self, method: &str, path: &str, body: &str) -> Result<Vec<(String, String)>> {
        let timestamp = Utc::now().timestamp().to_string();
        let message = format!("{timestamp}{method}{path}{body}");

        let secret_bytes =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &self.config.api_secret)
                .context("Failed to decode API secret")?;

        let mut mac =
            HmacSha256::new_from_slice(&secret_bytes).context("Failed to create HMAC")?;
        mac.update(message.as_bytes());
        let signature = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            mac.finalize().into_bytes(),
        );

        Ok(vec![
            ("POLY-API-KEY".to_string(), self.config.api_key.clone()),
            ("POLY-SIGNATURE".to_string(), signature),
            ("POLY-TIMESTAMP".to_string(), timestamp),
            (
                "POLY-PASSPHRASE".to_string(),
                self.config.api_passphrase.clone(),
            ),
        ])
    }

    /// Fetch all active markets with pagination
    pub async fn fetch_markets(&self, limit: usize) -> Result<Vec<Market>> {
        let mut all_markets = Vec::new();
        let mut cursor = String::new();
        let page_size = 100.min(limit);

        loop {
            let url = if cursor.is_empty() {
                format!(
                    "{}/markets?limit={}&active=true",
                    self.config.api_url, page_size
                )
            } else {
                format!(
                    "{}/markets?limit={}&active=true&next_cursor={}",
                    self.config.api_url, page_size, cursor
                )
            };

            debug!("Fetching markets: {}", url);

            let resp = self
                .client
                .get(&url)
                .send()
                .await
                .context("Failed to fetch markets")?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                warn!("Markets API error {}: {}", status, body);
                break;
            }

            let raw: MarketsResponse = resp.json().await.context("Failed to parse markets")?;

            if let Some(data) = raw.data {
                for raw_market in data {
                    if let Some(market) = parse_market(raw_market) {
                        all_markets.push(market);
                    }
                }
            }

            match raw.next_cursor {
                Some(nc) if !nc.is_empty() && nc != "LTE=" && all_markets.len() < limit => {
                    cursor = nc;
                }
                _ => break,
            }
        }

        info!("Fetched {} active markets", all_markets.len());
        Ok(all_markets)
    }

    /// Get current USDC balance
    pub async fn get_balance(&self) -> Result<f64> {
        let path = "/balance";
        let headers = self.auth_headers("GET", path, "")?;
        let url = format!("{}{}", self.config.api_url, path);

        let mut req = self.client.get(&url);
        for (key, value) in headers {
            req = req.header(&key, &value);
        }

        let resp = req.send().await.context("Failed to fetch balance")?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Balance API error: {}", body);
        }

        let balance_resp: BalanceResponse =
            resp.json().await.context("Failed to parse balance")?;

        let balance = balance_resp
            .balance
            .unwrap_or_else(|| "0".to_string())
            .parse::<f64>()
            .context("Failed to parse balance value")?;

        Ok(balance)
    }

    /// Place a market order
    pub async fn place_order(
        &self,
        token_id: &str,
        side: TradeSide,
        price: f64,
        size: f64,
    ) -> Result<Order> {
        let path = "/order";
        let order_body = serde_json::json!({
            "tokenID": token_id,
            "price": price,
            "size": size,
            "side": match side {
                TradeSide::Yes => "BUY",
                TradeSide::No => "BUY",
            },
            "type": "GTC",
        });

        let body_str = serde_json::to_string(&order_body)?;
        let headers = self.auth_headers("POST", path, &body_str)?;
        let url = format!("{}{}", self.config.api_url, path);

        let mut req = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .body(body_str);

        for (key, value) in headers {
            req = req.header(&key, &value);
        }

        let resp = req.send().await.context("Failed to place order")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Order API error {}: {}", status, body);
        }

        let order_resp: OrderResponse = resp.json().await.context("Failed to parse order")?;

        let order = Order {
            id: order_resp.order_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            market_condition_id: String::new(),
            token_id: token_id.to_string(),
            side,
            price,
            size,
            status: match order_resp.status.as_deref() {
                Some("matched") => OrderStatus::Filled,
                Some("partial") => OrderStatus::PartiallyFilled,
                _ => OrderStatus::Pending,
            },
            created_at: Utc::now(),
        };

        info!(
            "Order placed: {} {} @ {} (size: {}) - {:?}",
            side, token_id, price, size, order.status
        );

        Ok(order)
    }

    /// Get orderbook for a specific token
    pub async fn get_orderbook(&self, token_id: &str) -> Result<OrderbookSnapshot> {
        let url = format!(
            "{}/book?token_id={}",
            self.config.api_url, token_id
        );

        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to fetch orderbook")?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Orderbook API error: {}", body);
        }

        resp.json()
            .await
            .context("Failed to parse orderbook")
    }

    /// Cancel an existing order
    pub async fn cancel_order(&self, order_id: &str) -> Result<()> {
        let path = format!("/order/{}", order_id);
        let headers = self.auth_headers("DELETE", &path, "")?;
        let url = format!("{}{}", self.config.api_url, path);

        let mut req = self.client.delete(&url);
        for (key, value) in headers {
            req = req.header(&key, &value);
        }

        let resp = req.send().await.context("Failed to cancel order")?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Cancel order error: {}", body);
        }

        info!("Order {} cancelled", order_id);
        Ok(())
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OrderbookSnapshot {
    pub bids: Vec<OrderbookLevel>,
    pub asks: Vec<OrderbookLevel>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OrderbookLevel {
    pub price: String,
    pub size: String,
}

fn parse_market(raw: RawMarket) -> Option<Market> {
    let condition_id = raw.condition_id?;
    let question = raw.question.unwrap_or_default();
    let description = raw.description.unwrap_or_default();

    let outcomes: Vec<String> = match raw.outcomes {
        Some(serde_json::Value::Array(arr)) => arr
            .into_iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        Some(serde_json::Value::String(s)) => {
            serde_json::from_str(&s).unwrap_or_else(|_| vec!["Yes".into(), "No".into()])
        }
        _ => vec!["Yes".into(), "No".into()],
    };

    let outcome_prices: Vec<f64> = match raw.outcome_prices {
        Some(serde_json::Value::Array(arr)) => arr
            .into_iter()
            .filter_map(|v| match v {
                serde_json::Value::Number(n) => n.as_f64(),
                serde_json::Value::String(s) => s.parse().ok(),
                _ => None,
            })
            .collect(),
        Some(serde_json::Value::String(s)) => serde_json::from_str(&s).unwrap_or_default(),
        _ => Vec::new(),
    };

    let volume = parse_numeric_value(raw.volume);
    let liquidity = parse_numeric_value(raw.liquidity);

    let end_date = raw
        .end_date_iso
        .and_then(|s| s.parse::<DateTime<chrono::Utc>>().ok());

    let tags = raw.tags.unwrap_or_default();
    let category = MarketCategory::from_tags(&tags, &question);

    Some(Market {
        condition_id,
        question,
        description,
        market_slug: raw.market_slug.unwrap_or_default(),
        outcomes,
        outcome_prices,
        volume,
        liquidity,
        end_date,
        category,
        active: raw.active.unwrap_or(true),
        closed: raw.closed.unwrap_or(false),
    })
}

fn parse_numeric_value(value: Option<serde_json::Value>) -> f64 {
    match value {
        Some(serde_json::Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(serde_json::Value::String(s)) => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

use chrono::DateTime;
