mod api;
mod analysis;
mod config;
mod data_sources;
mod survival;
mod trading;
mod types;

use std::path::Path;

use anyhow::{Context, Result};
use chrono::Utc;
use clap::Parser;
use tracing::{error, info, warn};

use crate::analysis::scanner::MarketScanner;
use crate::api::claude::ClaudeClient;
use crate::api::polymarket::PolymarketClient;
use crate::config::Config;
use crate::data_sources::DataSourceManager;
use crate::survival::SurvivalMonitor;
use crate::trading::executor::TradeExecutor;
use crate::types::AgentState;

#[derive(Parser, Debug)]
#[command(
    name = "polymarket-agent",
    about = "Autonomous trading agent for Polymarket prediction markets",
    long_about = "An AI-powered trading agent that scans Polymarket for mispriced \
                  prediction markets, estimates fair values using Claude, and executes \
                  trades using Kelly Criterion position sizing. The agent pays for its \
                  own API costs from trading profits — if it runs out of money, it dies."
)]
struct Cli {
    /// Path to config file (uses env vars if not provided)
    #[arg(short, long)]
    config: Option<String>,

    /// Initial bankroll in USDC (overrides config)
    #[arg(short, long, default_value = "50.0")]
    bankroll: f64,

    /// Resume from saved state file
    #[arg(short, long)]
    resume: Option<String>,

    /// Dry run mode (analyze but don't execute trades)
    #[arg(long, default_value = "false")]
    dry_run: bool,

    /// Maximum number of markets to scan per cycle
    #[arg(long, default_value = "500")]
    max_markets: usize,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Load config
    let config = Config::load_or_env(cli.config.as_deref().map(Path::new))
        .context("Failed to load configuration")?;

    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| config.agent.log_level.parse().unwrap_or_default()),
        )
        .with_target(false)
        .init();

    info!("═══════════════════════════════════════════════");
    info!("  POLYMARKET AUTONOMOUS TRADING AGENT");
    info!("═══════════════════════════════════════════════");
    info!("  Bankroll:      ${:.2}", cli.bankroll);
    info!("  Min edge:      {:.1}%", config.trading.min_edge * 100.0);
    info!("  Max position:  {:.1}%", config.trading.max_position_fraction * 100.0);
    info!("  Kelly frac:    {:.0}%", config.trading.kelly_fraction * 100.0);
    info!("  Scan interval: {}s", config.trading.scan_interval_secs);
    info!("  Dry run:       {}", cli.dry_run);
    info!("═══════════════════════════════════════════════");

    if cli.dry_run {
        warn!("DRY RUN MODE — trades will be analyzed but NOT executed");
    }

    // Initialize or resume state
    let mut state = if let Some(ref path) = cli.resume {
        info!("Resuming from state file: {}", path);
        AgentState::load(path).context("Failed to load state")?
    } else {
        AgentState::new(cli.bankroll)
    };

    // Initialize components
    let polymarket =
        PolymarketClient::new(&config.polymarket).context("Failed to initialize Polymarket client")?;
    let mut claude = ClaudeClient::new(&config.claude);
    let scanner = MarketScanner::new(&config);
    let data_sources = DataSourceManager::new(&config.data_sources);
    let survival = SurvivalMonitor::new(
        config.trading.min_bankroll,
        config.agent.estimated_cost_per_call,
    );

    info!("All components initialized. Starting main loop...");

    // ── Main Loop ──
    loop {
        // Check: is the agent still alive?
        if survival.should_die(&state) {
            survival.death_report(&state);
            state.save(&config.agent.state_file)?;
            break;
        }

        // Can we afford another cycle?
        if !survival.can_afford_cycle(&state) {
            error!("Cannot afford another API cycle. Agent shutting down.");
            survival.death_report(&state);
            state.save(&config.agent.state_file)?;
            break;
        }

        let cycle_start = Utc::now();
        info!(
            "────── Cycle {} starting at {} ──────",
            state.cycles_completed + 1,
            cycle_start.format("%Y-%m-%d %H:%M:%S UTC")
        );

        // Step 1: Fetch markets
        let markets = match polymarket.fetch_markets(cli.max_markets).await {
            Ok(m) => m,
            Err(e) => {
                warn!("Failed to fetch markets: {} — retrying next cycle", e);
                sleep_until_next_cycle(config.trading.scan_interval_secs).await;
                continue;
            }
        };

        info!("Fetched {} active markets", markets.len());

        // Step 2: Update existing positions
        TradeExecutor::update_positions(&polymarket, &mut state).await.ok();
        TradeExecutor::realize_completed(&mut state);

        // Step 3: Scan for opportunities (this calls Claude — costs money)
        let pre_scan_cost = claude.session_cost();
        let opportunities = match scanner.scan(&markets, &mut claude, &data_sources, &state).await
        {
            Ok(opps) => opps,
            Err(e) => {
                warn!("Scan failed: {} — retrying next cycle", e);
                let scan_cost = claude.session_cost() - pre_scan_cost;
                survival.deduct_cycle_cost(&mut state, scan_cost);
                sleep_until_next_cycle(config.trading.scan_interval_secs).await;
                continue;
            }
        };
        let scan_cost = claude.session_cost() - pre_scan_cost;

        // Step 4: Execute trades
        if !cli.dry_run && !opportunities.is_empty() {
            match TradeExecutor::execute(&polymarket, opportunities, &mut state).await {
                Ok(count) => info!("Executed {} trades this cycle", count),
                Err(e) => warn!("Trade execution error: {}", e),
            }
        } else if !opportunities.is_empty() {
            info!(
                "DRY RUN: Would have executed {} trades",
                opportunities.len()
            );
        }

        // Step 5: Pay for API usage (agent pays for itself)
        survival.deduct_cycle_cost(&mut state, scan_cost);

        // Step 6: Update cycle stats
        state.cycles_completed += 1;
        state.last_cycle_at = Some(Utc::now());

        // Step 7: Status report
        survival.status_report(&state);

        // Step 8: Persist state
        if let Err(e) = state.save(&config.agent.state_file) {
            warn!("Failed to save state: {}", e);
        }

        // Sleep until next cycle
        sleep_until_next_cycle(config.trading.scan_interval_secs).await;
    }

    info!("Agent terminated. Final state saved to: {}", config.agent.state_file);
    Ok(())
}

async fn sleep_until_next_cycle(interval_secs: u64) {
    info!("Sleeping for {}s until next cycle...", interval_secs);
    tokio::time::sleep(std::time::Duration::from_secs(interval_secs)).await;
}
