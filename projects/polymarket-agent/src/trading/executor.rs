use anyhow::{Context, Result};
use chrono::Utc;
use tracing::{info, warn};

use crate::api::polymarket::PolymarketClient;
use crate::types::{AgentState, OrderStatus, Position, TradeRecord, TradeSide, TradingOpportunity};

pub struct TradeExecutor;

impl TradeExecutor {
    /// Execute a list of trading opportunities
    pub async fn execute(
        client: &PolymarketClient,
        opportunities: Vec<TradingOpportunity>,
        state: &mut AgentState,
    ) -> Result<usize> {
        let mut executed = 0;

        for opp in opportunities {
            if !state.is_alive() {
                warn!("Agent died during execution (bankroll depleted)");
                break;
            }

            // Don't trade more than we have
            if opp.position_size > state.bankroll {
                info!(
                    "Skipping trade: position ${:.2} > bankroll ${:.2}",
                    opp.position_size, state.bankroll
                );
                continue;
            }

            match Self::execute_single(client, &opp, state).await {
                Ok(true) => {
                    executed += 1;
                    info!(
                        "Trade executed: {} {} @ {:.3} | size=${:.2} | edge={:.1}% | bankroll=${:.2}",
                        opp.side,
                        opp.market.question,
                        opp.market_price,
                        opp.position_size,
                        opp.edge * 100.0,
                        state.bankroll,
                    );
                }
                Ok(false) => {
                    info!("Trade skipped: {}", opp.market.question);
                }
                Err(e) => {
                    warn!(
                        "Trade failed for '{}': {}",
                        opp.market.question, e
                    );
                }
            }
        }

        Ok(executed)
    }

    async fn execute_single(
        client: &PolymarketClient,
        opp: &TradingOpportunity,
        state: &mut AgentState,
    ) -> Result<bool> {
        // Determine which token to buy
        let token_id = match opp.side {
            TradeSide::Yes => {
                // The first token is typically YES
                opp.market
                    .condition_id
                    .clone()
            }
            TradeSide::No => {
                // For NO, we need the complementary token
                opp.market
                    .condition_id
                    .clone()
            }
        };

        // Calculate number of shares: position_size / price
        let shares = opp.position_size / opp.market_price;

        // Place the order
        let order = client
            .place_order(&token_id, opp.side, opp.market_price, shares)
            .await
            .context("Failed to place order")?;

        match order.status {
            OrderStatus::Filled | OrderStatus::PartiallyFilled => {
                // Deduct from bankroll
                let cost = if order.status == OrderStatus::PartiallyFilled {
                    opp.position_size * 0.5 // Approximate for partial fills
                } else {
                    opp.position_size
                };

                state.bankroll -= cost;
                state.trades_executed += 1;

                // Record position
                state.positions.push(Position {
                    market_condition_id: opp.market.condition_id.clone(),
                    market_question: opp.market.question.clone(),
                    side: opp.side,
                    entry_price: opp.market_price,
                    size: cost,
                    current_price: opp.market_price,
                    unrealized_pnl: 0.0,
                    opened_at: Utc::now(),
                });

                // Record trade
                state.trade_history.push(TradeRecord {
                    market_question: opp.market.question.clone(),
                    condition_id: opp.market.condition_id.clone(),
                    side: opp.side,
                    entry_price: opp.market_price,
                    exit_price: None,
                    size: cost,
                    pnl: None,
                    reasoning: opp.fair_value.reasoning.clone(),
                    opened_at: Utc::now(),
                    closed_at: None,
                });

                Ok(true)
            }
            OrderStatus::Pending => {
                info!("Order pending, will check on next cycle");
                Ok(false)
            }
            OrderStatus::Cancelled | OrderStatus::Failed => {
                warn!("Order failed or cancelled");
                Ok(false)
            }
        }
    }

    /// Update existing positions with current prices
    pub async fn update_positions(
        client: &PolymarketClient,
        state: &mut AgentState,
    ) -> Result<()> {
        for position in &mut state.positions {
            // Fetch current market data
            match client.get_orderbook(&position.market_condition_id).await {
                Ok(book) => {
                    // Use best bid as current price estimate
                    if let Some(best_bid) = book.bids.first() {
                        if let Ok(price) = best_bid.price.parse::<f64>() {
                            position.current_price = price;
                            let shares = position.size / position.entry_price;
                            position.unrealized_pnl =
                                shares * (position.current_price - position.entry_price);
                        }
                    }
                }
                Err(e) => {
                    warn!(
                        "Failed to update position for '{}': {}",
                        position.market_question, e
                    );
                }
            }
        }

        Ok(())
    }

    /// Check for resolved markets and realize PnL
    pub fn realize_completed(state: &mut AgentState) {
        let mut resolved_indices = Vec::new();

        for (i, position) in state.positions.iter().enumerate() {
            // A position is resolved if the price is very close to 0 or 1
            if position.current_price > 0.95 || position.current_price < 0.05 {
                let won = match position.side {
                    TradeSide::Yes => position.current_price > 0.95,
                    TradeSide::No => position.current_price < 0.05,
                };

                let shares = position.size / position.entry_price;
                let pnl = if won {
                    shares * 1.0 - position.size // Payout - cost
                } else {
                    -position.size // Lost the entire position
                };

                state.realized_pnl += pnl;
                state.bankroll += position.size + pnl; // Return cost + pnl

                if won {
                    state.winning_trades += 1;
                }

                // Update trade history
                if let Some(record) = state
                    .trade_history
                    .iter_mut()
                    .rev()
                    .find(|r| r.condition_id == position.market_condition_id && r.exit_price.is_none())
                {
                    record.exit_price = Some(position.current_price);
                    record.pnl = Some(pnl);
                    record.closed_at = Some(Utc::now());
                }

                info!(
                    "Position resolved: {} | {} | PnL: ${:.2}",
                    position.market_question,
                    if won { "WON" } else { "LOST" },
                    pnl
                );

                resolved_indices.push(i);
            }
        }

        // Remove resolved positions (in reverse to maintain indices)
        for i in resolved_indices.into_iter().rev() {
            state.positions.remove(i);
        }
    }
}
