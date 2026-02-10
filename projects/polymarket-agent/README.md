# Polymarket Autonomous Trading Agent

An AI-powered trading agent that autonomously trades on Polymarket prediction markets. It pays for its own Claude API inference from trading profits — if it runs out of money, it dies.

## How It Works

Every 10 minutes:
1. **Scans** 500-1000 active Polymarket markets
2. **Fetches** external data (NOAA weather, sports injuries, crypto on-chain metrics)
3. **Estimates** fair value for each market using Claude reasoning
4. **Identifies** mispricing > 8% between fair value and market price
5. **Sizes** positions using Kelly Criterion (capped at 6% of bankroll)
6. **Executes** trades via Polymarket CLOB API
7. **Pays** its own API bill from the bankroll

If balance hits $0, the agent dies.

## Architecture

```
src/
├── main.rs                    # Main loop (10-min cycle)
├── config.rs                  # Configuration from env/file
├── types.rs                   # Core data types
├── api/
│   ├── polymarket.rs          # Polymarket CLOB API client
│   └── claude.rs              # Claude API client (with cost tracking)
├── analysis/
│   └── scanner.rs             # Market scanner + opportunity finder
├── trading/
│   ├── kelly.rs               # Kelly Criterion position sizing
│   └── executor.rs            # Trade execution + position management
├── data_sources/
│   ├── weather.rs             # NOAA + Open-Meteo weather data
│   ├── sports.rs              # ESPN injuries + odds data
│   └── crypto.rs              # CoinGecko + on-chain metrics + sentiment
└── survival/
    └── mod.rs                 # Self-funding / survival monitor
```

## Setup

### Prerequisites
- Rust 1.75+
- Polymarket account with API access
- Anthropic API key
- USDC on Polygon for initial bankroll

### Configuration

```bash
cp .env.example .env
# Edit .env with your API keys
```

### Build & Run

```bash
# Build (release mode for speed)
cargo build --release

# Run with $50 bankroll
./target/release/polymarket-agent --bankroll 50.0

# Dry run (analyze but don't trade)
./target/release/polymarket-agent --bankroll 50.0 --dry-run

# Resume from saved state
./target/release/polymarket-agent --resume agent_state.json

# Scan more markets per cycle
./target/release/polymarket-agent --bankroll 50.0 --max-markets 1000
```

## Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MIN_EDGE` | 8% | Minimum mispricing to trigger a trade |
| `MAX_POSITION_FRACTION` | 6% | Max bankroll per position (Kelly cap) |
| `KELLY_FRACTION` | 50% | Fractional Kelly multiplier for safety |
| `SCAN_INTERVAL_SECS` | 600 | Seconds between scan cycles |
| `MAX_OPEN_POSITIONS` | 20 | Maximum concurrent positions |
| `MIN_LIQUIDITY` | $1,000 | Minimum market liquidity |

## Data Sources

- **Weather**: NOAA Climate Data Online + Open-Meteo (free) — parses forecasts before Polymarket updates
- **Sports**: ESPN injury reports + The Odds API — finds mispricing from injury news
- **Crypto**: CoinGecko prices + Fear & Greed index + blockchain.info on-chain metrics

## Risk Management

- **Half Kelly**: Uses 50% Kelly Criterion for conservative sizing
- **Position cap**: No single position exceeds 6% of bankroll
- **Confidence filter**: Skips trades where Claude's confidence is below 30%
- **Liquidity filter**: Only trades markets with $1000+ liquidity
- **State persistence**: Saves state to disk every cycle for crash recovery

## Costs

- Claude API: ~$0.01-0.05 per market analysis (Sonnet)
- VPS: ~$4.50/month
- The agent deducts API costs from its bankroll each cycle
