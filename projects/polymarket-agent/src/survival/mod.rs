use tracing::{error, info, warn};

use crate::types::AgentState;

/// The survival module tracks the agent's financial health.
/// If the agent can't afford to operate, it dies.
pub struct SurvivalMonitor {
    /// Minimum bankroll to continue operating
    min_bankroll: f64,
    /// Estimated cost per reasoning cycle
    cost_per_cycle: f64,
}

impl SurvivalMonitor {
    pub fn new(min_bankroll: f64, cost_per_cycle: f64) -> Self {
        Self {
            min_bankroll,
            cost_per_cycle,
        }
    }

    /// Check if the agent can afford another cycle
    pub fn can_afford_cycle(&self, state: &AgentState) -> bool {
        state.bankroll > self.cost_per_cycle
    }

    /// Check if the agent should die (bankroll depleted)
    pub fn should_die(&self, state: &AgentState) -> bool {
        !state.is_alive() || state.bankroll <= self.min_bankroll
    }

    /// Deduct API cost from bankroll (agent pays for itself)
    pub fn deduct_cycle_cost(&self, state: &mut AgentState, actual_cost: f64) {
        state.deduct_api_cost(actual_cost);

        info!(
            "API cost: ${:.4} | Total API costs: ${:.4} | Bankroll: ${:.2}",
            actual_cost, state.total_api_costs, state.bankroll
        );

        if state.bankroll < self.cost_per_cycle * 10.0 {
            warn!(
                "LOW BANKROLL WARNING: ${:.2} remaining (~{} cycles left)",
                state.bankroll,
                (state.bankroll / self.cost_per_cycle) as u64
            );
        }
    }

    /// Print survival status report
    pub fn status_report(&self, state: &AgentState) {
        let uptime = chrono::Utc::now()
            .signed_duration_since(state.started_at)
            .num_seconds();
        let hours = uptime / 3600;
        let minutes = (uptime % 3600) / 60;

        info!("═══════════════════════════════════════════════");
        info!("  AGENT STATUS REPORT");
        info!("═══════════════════════════════════════════════");
        info!(
            "  Status:      {}",
            if state.is_alive() { "ALIVE" } else { "DEAD" }
        );
        info!("  Uptime:      {}h {}m", hours, minutes);
        info!("  Bankroll:    ${:.2}", state.bankroll);
        info!("  Initial:     ${:.2}", state.initial_bankroll);
        info!("  Net PnL:     ${:.2}", state.net_pnl());
        info!("  ROI:         {:.1}%", state.roi());
        info!("  Trades:      {}", state.trades_executed);
        info!("  Win Rate:    {:.1}%", state.win_rate() * 100.0);
        info!("  Open Pos:    {}", state.positions.len());
        info!("  API Costs:   ${:.4}", state.total_api_costs);
        info!("  Cycles:      {}", state.cycles_completed);
        info!(
            "  Est. Cycles: ~{}",
            if self.cost_per_cycle > 0.0 {
                (state.bankroll / self.cost_per_cycle) as u64
            } else {
                0
            }
        );
        info!("═══════════════════════════════════════════════");
    }

    /// Final death report when bankroll hits zero
    pub fn death_report(&self, state: &AgentState) {
        error!("═══════════════════════════════════════════════");
        error!("  AGENT DEATH REPORT");
        error!("═══════════════════════════════════════════════");
        error!("  Final bankroll:  ${:.2}", state.bankroll);
        error!("  Total PnL:       ${:.2}", state.realized_pnl);
        error!("  API costs paid:  ${:.4}", state.total_api_costs);
        error!("  Net result:      ${:.2}", state.net_pnl());
        error!("  Trades:          {}", state.trades_executed);
        error!("  Win rate:        {:.1}%", state.win_rate() * 100.0);
        error!("  Cycles survived: {}", state.cycles_completed);
        error!("═══════════════════════════════════════════════");
        error!("  The agent could not pay for itself. It is dead.");
        error!("═══════════════════════════════════════════════");
    }
}
