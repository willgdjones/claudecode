/**
 * Social Automation
 *
 * Sustainable social media automation with human-like patterns.
 * Control via Telegram bot from your phone.
 */

export * from './platforms/reddit.js';
export * from './platforms/twitter.js';
export * from './monitor/index.js';

// Re-export shared utilities
export { RateLimiter, TaskScheduler, PLATFORM_LIMITS } from '@projects/shared';

import { RedditConnector, RedditConfig } from './platforms/reddit.js';
import { TwitterConnector, TwitterConfig } from './platforms/twitter.js';
import { SocialMonitor, MonitorConfig, SocialMatch } from './monitor/index.js';
import { TaskScheduler } from '@projects/shared';

export interface SocialAutomationConfig {
  reddit?: RedditConfig;
  twitter?: TwitterConfig;
  monitor?: Omit<MonitorConfig, 'onMatch'>;
  onMatch?: (match: SocialMatch) => void | Promise<void>;
}

/**
 * Main orchestrator for social automation
 */
export class SocialAutomation {
  public reddit?: RedditConnector;
  public twitter?: TwitterConnector;
  public monitor?: SocialMonitor;
  public scheduler: TaskScheduler;

  constructor(config: SocialAutomationConfig) {
    this.scheduler = new TaskScheduler();

    // Initialize Reddit
    if (config.reddit) {
      this.reddit = new RedditConnector(config.reddit);
    }

    // Initialize Twitter
    if (config.twitter) {
      this.twitter = new TwitterConnector(config.twitter);
    }

    // Initialize Monitor
    if (config.monitor) {
      this.monitor = new SocialMonitor({
        ...config.monitor,
        onMatch: config.onMatch || this.defaultMatchHandler.bind(this),
      });

      if (this.reddit) this.monitor.connectReddit(this.reddit);
      if (this.twitter) this.monitor.connectTwitter(this.twitter);
    }

    // Register task executors
    this.setupTaskExecutors();
  }

  /**
   * Default handler for social matches
   */
  private async defaultMatchHandler(match: SocialMatch): Promise<void> {
    console.log(`[${match.platform}] ${match.type} from @${match.author}: ${match.content.slice(0, 100)}...`);
  }

  /**
   * Set up task executors for scheduled posts
   */
  private setupTaskExecutors(): void {
    // Reddit post executor
    this.scheduler.registerExecutor(
      'reddit-post',
      async (task) => {
        if (!this.reddit) throw new Error('Reddit not configured');
        const result = await this.reddit.submitPost(task.payload as any);
        if (!result.success) throw new Error(result.error);
        return result;
      },
      { maxActions: 2, windowMs: 24 * 60 * 60 * 1000, minDelay: 4 * 60 * 60 * 1000, maxDelay: 8 * 60 * 60 * 1000, jitter: true }
    );

    // Reddit comment executor
    this.scheduler.registerExecutor(
      'reddit-comment',
      async (task) => {
        if (!this.reddit) throw new Error('Reddit not configured');
        const result = await this.reddit.submitComment(task.payload as any);
        if (!result.success) throw new Error(result.error);
        return result;
      },
      { maxActions: 10, windowMs: 60 * 60 * 1000, minDelay: 5 * 60 * 1000, maxDelay: 15 * 60 * 1000, jitter: true }
    );

    // Twitter tweet executor
    this.scheduler.registerExecutor(
      'twitter-tweet',
      async (task) => {
        if (!this.twitter) throw new Error('Twitter not configured');
        const result = await this.twitter.tweet(task.payload as any);
        if (!result.success) throw new Error(result.error);
        return result;
      },
      { maxActions: 5, windowMs: 24 * 60 * 60 * 1000, minDelay: 2 * 60 * 60 * 1000, maxDelay: 6 * 60 * 60 * 1000, jitter: true }
    );
  }

  /**
   * Schedule a Reddit post
   */
  scheduleRedditPost(subreddit: string, title: string, text?: string, delay?: number): string {
    return this.scheduler.schedule('reddit-post', { subreddit, title, text }, { delay });
  }

  /**
   * Schedule a tweet
   */
  scheduleTweet(text: string, delay?: number): string {
    return this.scheduler.schedule('twitter-tweet', { text }, { delay });
  }

  /**
   * Start all automation
   */
  start(): void {
    this.scheduler.start();
    this.monitor?.start();
    console.log('Social automation started');
  }

  /**
   * Stop all automation
   */
  stop(): void {
    this.scheduler.stop();
    this.monitor?.stop();
    console.log('Social automation stopped');
  }

  /**
   * Get overall status
   */
  getStatus(): {
    scheduler: ReturnType<TaskScheduler['getStatus']>;
    monitor?: ReturnType<SocialMonitor['getStats']>;
    reddit?: ReturnType<RedditConnector['getStatus']>;
    twitter?: ReturnType<TwitterConnector['getStatus']>;
  } {
    return {
      scheduler: this.scheduler.getStatus(),
      monitor: this.monitor?.getStats(),
      reddit: this.reddit?.getStatus(),
      twitter: this.twitter?.getStatus(),
    };
  }
}
