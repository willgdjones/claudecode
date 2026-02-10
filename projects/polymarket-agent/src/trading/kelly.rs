/// Kelly Criterion position sizing for prediction markets.
///
/// The Kelly formula for binary outcomes:
///   f* = (p * b - q) / b
///
/// Where:
///   p = probability of winning
///   q = 1 - p (probability of losing)
///   b = net odds received (payout / cost - 1)
///   f* = optimal fraction of bankroll to wager
///
/// In prediction markets:
///   - Buying YES at price P: you pay P, get 1 if correct → b = (1 - P) / P
///   - Buying NO at price P: you pay P, get 1 if correct → b = (1 - P) / P
pub struct KellyCriterion {
    /// Fractional Kelly multiplier (e.g., 0.5 for half Kelly)
    fraction: f64,
    /// Maximum position as fraction of bankroll
    max_fraction: f64,
}

impl KellyCriterion {
    pub fn new(fraction: f64, max_fraction: f64) -> Self {
        Self {
            fraction,
            max_fraction,
        }
    }

    /// Calculate optimal position size in USDC
    ///
    /// * `win_prob` - Our estimated probability of winning
    /// * `market_price` - Current market price (cost per share)
    /// * `bankroll` - Current total bankroll in USDC
    pub fn position_size(&self, win_prob: f64, market_price: f64, bankroll: f64) -> f64 {
        if market_price <= 0.0 || market_price >= 1.0 || bankroll <= 0.0 {
            return 0.0;
        }

        let p = win_prob.clamp(0.01, 0.99);
        let q = 1.0 - p;

        // Net odds: if you buy at price P and win, you get 1.0 back
        // So your net profit is (1.0 - P) on a bet of P
        let b = (1.0 - market_price) / market_price;

        // Kelly formula
        let kelly_fraction = (p * b - q) / b;

        // If Kelly says don't bet, don't bet
        if kelly_fraction <= 0.0 {
            return 0.0;
        }

        // Apply fractional Kelly for safety
        let adjusted = kelly_fraction * self.fraction;

        // Cap at max position size
        let capped = adjusted.min(self.max_fraction);

        // Convert to USDC amount
        let position = capped * bankroll;

        // Round to 2 decimal places
        (position * 100.0).round() / 100.0
    }

    /// Calculate the expected value of a trade
    pub fn expected_value(&self, win_prob: f64, market_price: f64, size: f64) -> f64 {
        let profit_if_win = size * (1.0 / market_price - 1.0);
        let loss_if_lose = size;
        win_prob * profit_if_win - (1.0 - win_prob) * loss_if_lose
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kelly_no_edge() {
        let kelly = KellyCriterion::new(0.5, 0.06);
        // Fair coin at fair price: no edge
        let size = kelly.position_size(0.5, 0.5, 1000.0);
        assert_eq!(size, 0.0);
    }

    #[test]
    fn test_kelly_positive_edge() {
        let kelly = KellyCriterion::new(0.5, 0.06);
        // We think 70% chance, market says 50%
        let size = kelly.position_size(0.70, 0.50, 1000.0);
        assert!(size > 0.0);
        assert!(size <= 60.0); // Max 6% of 1000
    }

    #[test]
    fn test_kelly_respects_max() {
        let kelly = KellyCriterion::new(1.0, 0.06);
        // Huge edge should still be capped at 6%
        let size = kelly.position_size(0.95, 0.20, 1000.0);
        assert!(size <= 60.0);
    }

    #[test]
    fn test_kelly_zero_bankroll() {
        let kelly = KellyCriterion::new(0.5, 0.06);
        let size = kelly.position_size(0.70, 0.50, 0.0);
        assert_eq!(size, 0.0);
    }

    #[test]
    fn test_kelly_negative_edge() {
        let kelly = KellyCriterion::new(0.5, 0.06);
        // We think 30% but market says 50%: negative edge
        let size = kelly.position_size(0.30, 0.50, 1000.0);
        assert_eq!(size, 0.0);
    }
}
