use anyhow::Result;
use tracing::{debug, info, warn};

use crate::api::claude::ClaudeClient;
use crate::config::Config;
use crate::data_sources::DataSourceManager;
use crate::trading::kelly::KellyCriterion;
use crate::types::{AgentState, FairValueEstimate, Market, TradeSide, TradingOpportunity};

pub struct MarketScanner {
    kelly: KellyCriterion,
    min_edge: f64,
    min_liquidity: f64,
    max_open_positions: usize,
}

impl MarketScanner {
    pub fn new(config: &Config) -> Self {
        Self {
            kelly: KellyCriterion::new(
                config.trading.kelly_fraction,
                config.trading.max_position_fraction,
            ),
            min_edge: config.trading.min_edge,
            min_liquidity: config.trading.min_liquidity,
            max_open_positions: config.trading.max_open_positions,
        }
    }

    /// Scan markets and find trading opportunities
    pub async fn scan(
        &self,
        markets: &[Market],
        claude: &mut ClaudeClient,
        data_sources: &DataSourceManager,
        state: &AgentState,
    ) -> Result<Vec<TradingOpportunity>> {
        let mut opportunities = Vec::new();

        // Filter markets worth analyzing
        let candidates: Vec<&Market> = markets
            .iter()
            .filter(|m| self.is_candidate(m, state))
            .collect();

        info!(
            "Scanning {} candidate markets (from {} total)",
            candidates.len(),
            markets.len()
        );

        for market in candidates {
            // Check if agent can still afford API calls
            if !state.is_alive() {
                warn!("Agent bankroll depleted during scan — stopping");
                break;
            }

            // Fetch external data for this market's category
            let external_data = match data_sources.fetch_for_market(market).await {
                Ok(data) => data,
                Err(e) => {
                    debug!("Failed to fetch external data for '{}': {}", market.question, e);
                    Vec::new()
                }
            };

            // Get Claude's fair value estimate
            let estimate = match claude.estimate_fair_value(market, &external_data).await {
                Ok(est) => est,
                Err(e) => {
                    warn!(
                        "Failed to analyze market '{}': {}",
                        market.question, e
                    );
                    continue;
                }
            };

            // Check for mispricing
            if let Some(opp) = self.evaluate_opportunity(market, &estimate, state.bankroll) {
                info!(
                    "Found opportunity: {} | edge={:.1}% | size=${:.2} | side={}",
                    market.question,
                    opp.edge * 100.0,
                    opp.position_size,
                    opp.side
                );
                opportunities.push(opp);
            }
        }

        // Sort by expected value (best opportunities first)
        opportunities.sort_by(|a, b| {
            b.expected_value
                .partial_cmp(&a.expected_value)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        info!("Found {} trading opportunities", opportunities.len());
        Ok(opportunities)
    }

    /// Check if a market is worth analyzing
    fn is_candidate(&self, market: &Market, state: &AgentState) -> bool {
        // Must be active and not closed
        if !market.active || market.closed {
            return false;
        }

        // Must have sufficient liquidity
        if market.liquidity < self.min_liquidity {
            return false;
        }

        // Must have prices
        if market.outcome_prices.is_empty() {
            return false;
        }

        // Don't exceed max positions
        if state.positions.len() >= self.max_open_positions {
            return false;
        }

        // Skip markets we already have positions in
        if state
            .positions
            .iter()
            .any(|p| p.market_condition_id == market.condition_id)
        {
            return false;
        }

        // Quick pre-filter: skip markets where prices suggest no possible edge
        // (prices too close to 0 or 1 are hard to beat)
        let yes_price = market.outcome_prices.first().copied().unwrap_or(0.5);
        if yes_price < 0.03 || yes_price > 0.97 {
            return false;
        }

        true
    }

    /// Evaluate if there's a tradeable edge in a market
    fn evaluate_opportunity(
        &self,
        market: &Market,
        estimate: &FairValueEstimate,
        bankroll: f64,
    ) -> Option<TradingOpportunity> {
        let yes_price = market.outcome_prices.first().copied()?;
        let no_price = market
            .outcome_prices
            .get(1)
            .copied()
            .unwrap_or(1.0 - yes_price);

        // Calculate edge for both sides
        let yes_edge = estimate.probability - yes_price;
        let no_edge = (1.0 - estimate.probability) - no_price;

        let (side, edge, market_price) = if yes_edge > no_edge && yes_edge > 0.0 {
            (TradeSide::Yes, yes_edge, yes_price)
        } else if no_edge > 0.0 {
            (TradeSide::No, no_edge, no_price)
        } else {
            return None; // No edge
        };

        // Must meet minimum edge threshold
        if edge < self.min_edge {
            return None;
        }

        // Only trade when confidence is reasonable
        if estimate.confidence < 0.3 {
            debug!(
                "Skipping low-confidence estimate for '{}' (confidence={:.2})",
                market.question, estimate.confidence
            );
            return None;
        }

        // Calculate position size using Kelly Criterion
        let win_prob = match side {
            TradeSide::Yes => estimate.probability,
            TradeSide::No => 1.0 - estimate.probability,
        };

        let position_size = self.kelly.position_size(win_prob, market_price, bankroll);

        if position_size < 1.0 {
            return None; // Not worth the gas/fees
        }

        let expected_value = edge * position_size;

        Some(TradingOpportunity {
            market: market.clone(),
            fair_value: estimate.clone(),
            edge,
            side,
            market_price,
            position_size,
            expected_value,
        })
    }
}
