/**
 * Twitter/X Platform Connector
 *
 * Uses twitter-api-v2 with sustainable rate limiting.
 */

import { RateLimiter, PLATFORM_LIMITS } from '@projects/shared';

export interface TwitterConfig {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
}

export interface Tweet {
  text: string;
  replyTo?: string;
  mediaIds?: string[];
}

export interface TwitterSearchOptions {
  query: string;
  maxResults?: number;
  sinceId?: string;
}

export class TwitterConnector {
  private config: TwitterConfig;
  private client: any; // TwitterApi instance
  private tweetLimiter: RateLimiter;
  private replyLimiter: RateLimiter;
  private initialized: boolean = false;

  constructor(config: TwitterConfig) {
    this.config = config;
    this.tweetLimiter = new RateLimiter(PLATFORM_LIMITS.twitter.tweet);
    this.replyLimiter = new RateLimiter(PLATFORM_LIMITS.twitter.reply);
  }

  /**
   * Initialize the Twitter client
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    const { TwitterApi } = await import('twitter-api-v2');

    this.client = new TwitterApi({
      appKey: this.config.appKey,
      appSecret: this.config.appSecret,
      accessToken: this.config.accessToken,
      accessSecret: this.config.accessSecret,
    });

    this.initialized = true;
  }

  /**
   * Post a tweet
   */
  async tweet(content: Tweet): Promise<{ success: boolean; id?: string; error?: string; nextActionIn: number }> {
    const limiter = content.replyTo ? this.replyLimiter : this.tweetLimiter;
    const check = limiter.canAct();

    if (!check.allowed) {
      return {
        success: false,
        error: check.reason,
        nextActionIn: check.retryAfter || 0,
      };
    }

    await this.init();

    try {
      const params: any = { text: content.text };

      if (content.replyTo) {
        params.reply = { in_reply_to_tweet_id: content.replyTo };
      }

      if (content.mediaIds?.length) {
        params.media = { media_ids: content.mediaIds };
      }

      const result = await this.client.v2.tweet(params);
      const nextActionIn = limiter.recordAction();

      return {
        success: true,
        id: result.data.id,
        nextActionIn,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        nextActionIn: 0,
      };
    }
  }

  /**
   * Search for tweets
   */
  async search(options: TwitterSearchOptions): Promise<any[]> {
    await this.init();

    const { query, maxResults = 10, sinceId } = options;

    const params: any = {
      query,
      max_results: maxResults,
      'tweet.fields': ['created_at', 'public_metrics', 'author_id'],
      expansions: ['author_id'],
      'user.fields': ['username', 'name', 'public_metrics'],
    };

    if (sinceId) {
      params.since_id = sinceId;
    }

    const result = await this.client.v2.search(params);

    const users = new Map(
      (result.includes?.users || []).map((u: any) => [u.id, u])
    );

    return (result.data || []).map((tweet: any) => ({
      id: tweet.id,
      text: tweet.text,
      createdAt: tweet.created_at,
      metrics: tweet.public_metrics,
      author: users.get(tweet.author_id),
    }));
  }

  /**
   * Get mentions of the authenticated user
   */
  async getMentions(sinceId?: string): Promise<any[]> {
    await this.init();

    const me = await this.client.v2.me();
    const mentions = await this.client.v2.userMentionTimeline(me.data.id, {
      max_results: 10,
      since_id: sinceId,
      'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'conversation_id'],
    });

    return mentions.data || [];
  }

  /**
   * Follow a user
   */
  async follow(userId: string): Promise<boolean> {
    await this.init();

    try {
      const me = await this.client.v2.me();
      await this.client.v2.follow(me.data.id, userId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Like a tweet
   */
  async like(tweetId: string): Promise<boolean> {
    await this.init();

    try {
      const me = await this.client.v2.me();
      await this.client.v2.like(me.data.id, tweetId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get rate limiter status
   */
  getStatus(): { tweets: ReturnType<RateLimiter['getStatus']>; replies: ReturnType<RateLimiter['getStatus']> } {
    return {
      tweets: this.tweetLimiter.getStatus(),
      replies: this.replyLimiter.getStatus(),
    };
  }
}

/**
 * Generate hashtags for a topic
 */
export function suggestHashtags(topic: string): string[] {
  const suggestions: Record<string, string[]> = {
    startup: ['#startup', '#entrepreneur', '#founder', '#buildinpublic', '#indiehackers'],
    saas: ['#SaaS', '#B2B', '#startup', '#tech', '#buildinpublic'],
    marketing: ['#marketing', '#digitalmarketing', '#growth', '#contentmarketing'],
    ai: ['#AI', '#MachineLearning', '#tech', '#ChatGPT', '#automation'],
    fitness: ['#fitness', '#health', '#wellness', '#nutrition', '#supplements'],
  };

  const lowerTopic = topic.toLowerCase();
  for (const [key, tags] of Object.entries(suggestions)) {
    if (lowerTopic.includes(key)) return tags;
  }

  return ['#buildinpublic', '#startup'];
}
