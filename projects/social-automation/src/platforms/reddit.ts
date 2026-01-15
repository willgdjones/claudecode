/**
 * Reddit Platform Connector
 *
 * Uses snoowrap (official Reddit API wrapper)
 * with sustainable rate limiting.
 */

import { RateLimiter, PLATFORM_LIMITS } from '@projects/shared';

export interface RedditConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  userAgent: string;
}

export interface RedditPost {
  subreddit: string;
  title: string;
  text?: string;
  url?: string;
  flair?: string;
}

export interface RedditComment {
  postId: string;
  text: string;
}

export interface SubredditMonitor {
  subreddit: string;
  keywords: string[];
  callback: (post: any) => void;
}

export class RedditConnector {
  private config: RedditConfig;
  private client: any; // snoowrap instance
  private postLimiter: RateLimiter;
  private commentLimiter: RateLimiter;
  private initialized: boolean = false;

  constructor(config: RedditConfig) {
    this.config = config;
    this.postLimiter = new RateLimiter(PLATFORM_LIMITS.reddit.post);
    this.commentLimiter = new RateLimiter(PLATFORM_LIMITS.reddit.comment);
  }

  /**
   * Initialize the Reddit client
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Dynamic import for snoowrap
    const Snoowrap = (await import('snoowrap')).default;

    this.client = new Snoowrap({
      userAgent: this.config.userAgent,
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      username: this.config.username,
      password: this.config.password,
    });

    // Configure snoowrap rate limiting (it has its own, we add ours on top)
    this.client.config({
      requestDelay: 1000,
      continueAfterRatelimitError: true,
    });

    this.initialized = true;
  }

  /**
   * Submit a text post
   */
  async submitPost(post: RedditPost): Promise<{ success: boolean; id?: string; error?: string; nextActionIn: number }> {
    const check = this.postLimiter.canAct();
    if (!check.allowed) {
      return {
        success: false,
        error: check.reason,
        nextActionIn: check.retryAfter || 0,
      };
    }

    await this.init();

    try {
      const subreddit = await this.client.getSubreddit(post.subreddit);
      let submission;

      if (post.url) {
        submission = await subreddit.submitLink({
          title: post.title,
          url: post.url,
        });
      } else {
        submission = await subreddit.submitSelfpost({
          title: post.title,
          text: post.text || '',
        });
      }

      const nextActionIn = this.postLimiter.recordAction();

      return {
        success: true,
        id: submission.name,
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
   * Submit a comment
   */
  async submitComment(comment: RedditComment): Promise<{ success: boolean; id?: string; error?: string; nextActionIn: number }> {
    const check = this.commentLimiter.canAct();
    if (!check.allowed) {
      return {
        success: false,
        error: check.reason,
        nextActionIn: check.retryAfter || 0,
      };
    }

    await this.init();

    try {
      const submission = await this.client.getSubmission(comment.postId);
      const reply = await submission.reply(comment.text);
      const nextActionIn = this.commentLimiter.recordAction();

      return {
        success: true,
        id: reply.name,
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
   * Search subreddit for relevant posts
   */
  async searchSubreddit(
    subreddit: string,
    query: string,
    options: { time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'; limit?: number } = {}
  ): Promise<any[]> {
    await this.init();

    const { time = 'week', limit = 25 } = options;

    const results = await this.client
      .getSubreddit(subreddit)
      .search({ query, time, limit, sort: 'relevance' });

    return results.map((post: any) => ({
      id: post.name,
      title: post.title,
      author: post.author.name,
      score: post.score,
      numComments: post.num_comments,
      url: post.url,
      selftext: post.selftext,
      createdUtc: post.created_utc,
      subreddit: post.subreddit.display_name,
    }));
  }

  /**
   * Get new posts from subreddit
   */
  async getNewPosts(subreddit: string, limit: number = 25): Promise<any[]> {
    await this.init();

    const posts = await this.client.getSubreddit(subreddit).getNew({ limit });

    return posts.map((post: any) => ({
      id: post.name,
      title: post.title,
      author: post.author?.name,
      score: post.score,
      numComments: post.num_comments,
      url: post.url,
      selftext: post.selftext,
      createdUtc: post.created_utc,
    }));
  }

  /**
   * Get rate limiter status
   */
  getStatus(): { posts: ReturnType<RateLimiter['getStatus']>; comments: ReturnType<RateLimiter['getStatus']> } {
    return {
      posts: this.postLimiter.getStatus(),
      comments: this.commentLimiter.getStatus(),
    };
  }
}

/**
 * Find relevant subreddits for a topic
 */
export function suggestSubreddits(topic: string): string[] {
  // Common subreddits by category - would be expanded with actual discovery
  const suggestions: Record<string, string[]> = {
    startup: ['startups', 'entrepreneur', 'smallbusiness', 'SideProject', 'indiehackers'],
    saas: ['SaaS', 'startups', 'webdev', 'programming', 'EntrepreneurRideAlong'],
    marketing: ['marketing', 'digital_marketing', 'socialmedia', 'SEO', 'PPC'],
    fitness: ['fitness', 'supplements', 'nutrition', 'loseit', 'gainit'],
    productivity: ['productivity', 'getdisciplined', 'selfimprovement', 'Entrepreneur'],
    tech: ['technology', 'programming', 'webdev', 'learnprogramming', 'cscareerquestions'],
  };

  const lowerTopic = topic.toLowerCase();
  for (const [key, subs] of Object.entries(suggestions)) {
    if (lowerTopic.includes(key)) return subs;
  }

  return ['startups', 'entrepreneur', 'SideProject'];
}
