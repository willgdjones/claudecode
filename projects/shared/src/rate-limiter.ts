/**
 * Rate Limiter with Human-Like Patterns
 *
 * Shared across all projects for sustainable automation.
 * Prevents bans by mimicking natural human behavior.
 */

export interface RateLimitConfig {
  /** Max actions per time window */
  maxActions: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Minimum delay between actions (ms) */
  minDelay: number;
  /** Maximum delay between actions (ms) */
  maxDelay: number;
  /** Add random jitter to delays */
  jitter: boolean;
  /** Active hours (0-23) - only act during these hours */
  activeHours?: [number, number];
  /** Warmup period - reduced activity for new accounts (ms) */
  warmupPeriod?: number;
  /** Action multiplier during warmup (0-1) */
  warmupMultiplier?: number;
}

export interface RateLimitState {
  actions: number[];
  createdAt: number;
  lastAction?: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxActions: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  minDelay: 30 * 1000,      // 30 seconds
  maxDelay: 5 * 60 * 1000,  // 5 minutes
  jitter: true,
  activeHours: [8, 23],
  warmupPeriod: 14 * 24 * 60 * 60 * 1000, // 2 weeks
  warmupMultiplier: 0.3,
};

export class RateLimiter {
  private config: RateLimitConfig;
  private state: RateLimitState;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      actions: [],
      createdAt: Date.now(),
    };
  }

  /**
   * Check if we're in the warmup period
   */
  private isInWarmup(): boolean {
    if (!this.config.warmupPeriod) return false;
    return Date.now() - this.state.createdAt < this.config.warmupPeriod;
  }

  /**
   * Get effective max actions (reduced during warmup)
   */
  private getEffectiveMaxActions(): number {
    if (this.isInWarmup() && this.config.warmupMultiplier) {
      return Math.floor(this.config.maxActions * this.config.warmupMultiplier);
    }
    return this.config.maxActions;
  }

  /**
   * Check if current hour is within active hours
   */
  private isActiveHour(): boolean {
    if (!this.config.activeHours) return true;
    const hour = new Date().getHours();
    const [start, end] = this.config.activeHours;
    return hour >= start && hour <= end;
  }

  /**
   * Clean up old actions outside the time window
   */
  private cleanupOldActions(): void {
    const cutoff = Date.now() - this.config.windowMs;
    this.state.actions = this.state.actions.filter(t => t > cutoff);
  }

  /**
   * Calculate delay with optional jitter
   */
  private calculateDelay(): number {
    const { minDelay, maxDelay, jitter } = this.config;
    let delay = minDelay + Math.random() * (maxDelay - minDelay);

    if (jitter) {
      // Add up to 20% random jitter
      const jitterAmount = delay * 0.2 * (Math.random() - 0.5);
      delay += jitterAmount;
    }

    return Math.floor(delay);
  }

  /**
   * Check if an action can be performed now
   */
  canAct(): { allowed: boolean; reason?: string; retryAfter?: number } {
    // Check active hours
    if (!this.isActiveHour()) {
      const [start] = this.config.activeHours!;
      const now = new Date();
      const nextActive = new Date(now);
      nextActive.setHours(start, 0, 0, 0);
      if (nextActive <= now) nextActive.setDate(nextActive.getDate() + 1);

      return {
        allowed: false,
        reason: 'Outside active hours',
        retryAfter: nextActive.getTime() - now.getTime(),
      };
    }

    // Clean up and check rate limit
    this.cleanupOldActions();
    const maxActions = this.getEffectiveMaxActions();

    if (this.state.actions.length >= maxActions) {
      const oldestAction = this.state.actions[0];
      const retryAfter = oldestAction + this.config.windowMs - Date.now();
      return {
        allowed: false,
        reason: `Rate limit exceeded (${maxActions} per ${this.config.windowMs / 1000}s)`,
        retryAfter,
      };
    }

    // Check minimum delay since last action
    if (this.state.lastAction) {
      const timeSinceLastAction = Date.now() - this.state.lastAction;
      if (timeSinceLastAction < this.config.minDelay) {
        return {
          allowed: false,
          reason: 'Minimum delay not met',
          retryAfter: this.config.minDelay - timeSinceLastAction,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Record an action and get recommended delay before next action
   */
  recordAction(): number {
    const now = Date.now();
    this.state.actions.push(now);
    this.state.lastAction = now;
    return this.calculateDelay();
  }

  /**
   * Get current state for persistence
   */
  getState(): RateLimitState {
    return { ...this.state };
  }

  /**
   * Restore state from persistence
   */
  restoreState(state: RateLimitState): void {
    this.state = { ...state };
  }

  /**
   * Get status information
   */
  getStatus(): {
    actionsInWindow: number;
    maxActions: number;
    isWarmup: boolean;
    isActiveHour: boolean;
    nextActionIn: number;
  } {
    this.cleanupOldActions();
    const check = this.canAct();

    return {
      actionsInWindow: this.state.actions.length,
      maxActions: this.getEffectiveMaxActions(),
      isWarmup: this.isInWarmup(),
      isActiveHour: this.isActiveHour(),
      nextActionIn: check.retryAfter || 0,
    };
  }
}

/**
 * Pre-configured rate limiters for common platforms
 */
export const PLATFORM_LIMITS = {
  reddit: {
    post: { maxActions: 2, windowMs: 24 * 60 * 60 * 1000, minDelay: 4 * 60 * 60 * 1000, maxDelay: 8 * 60 * 60 * 1000, jitter: true },
    comment: { maxActions: 10, windowMs: 60 * 60 * 1000, minDelay: 5 * 60 * 1000, maxDelay: 15 * 60 * 1000, jitter: true },
  },
  twitter: {
    tweet: { maxActions: 5, windowMs: 24 * 60 * 60 * 1000, minDelay: 2 * 60 * 60 * 1000, maxDelay: 6 * 60 * 60 * 1000, jitter: true },
    reply: { maxActions: 20, windowMs: 24 * 60 * 60 * 1000, minDelay: 30 * 60 * 1000, maxDelay: 90 * 60 * 1000, jitter: true },
  },
  hackernews: {
    post: { maxActions: 1, windowMs: 24 * 60 * 60 * 1000, minDelay: 24 * 60 * 60 * 1000, maxDelay: 48 * 60 * 60 * 1000, jitter: true },
    comment: { maxActions: 5, windowMs: 24 * 60 * 60 * 1000, minDelay: 2 * 60 * 60 * 1000, maxDelay: 4 * 60 * 60 * 1000, jitter: true },
  },
};
