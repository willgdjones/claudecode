/**
 * Social Monitor
 *
 * Monitors social platforms for:
 * - Brand mentions
 * - Relevant discussions
 * - Feedback and sentiment
 * - Opportunities to engage
 */

import { RedditConnector } from '../platforms/reddit.js';
import { TwitterConnector } from '../platforms/twitter.js';

export interface MonitorConfig {
  keywords: string[];
  subreddits: string[];
  twitterQueries: string[];
  pollInterval: number; // ms
  onMatch: (match: SocialMatch) => void | Promise<void>;
}

export interface SocialMatch {
  platform: 'reddit' | 'twitter' | 'hackernews';
  type: 'post' | 'comment' | 'tweet' | 'mention';
  id: string;
  content: string;
  author: string;
  url: string;
  matchedKeyword: string;
  timestamp: number;
  metrics?: {
    score?: number;
    replies?: number;
    likes?: number;
  };
}

export class SocialMonitor {
  private config: MonitorConfig;
  private reddit?: RedditConnector;
  private twitter?: TwitterConnector;
  private running: boolean = false;
  private seenIds: Set<string> = new Set();
  private lastCheck: Map<string, string> = new Map(); // platform -> last seen id

  constructor(config: MonitorConfig) {
    this.config = config;
  }

  /**
   * Connect Reddit
   */
  connectReddit(connector: RedditConnector): void {
    this.reddit = connector;
  }

  /**
   * Connect Twitter
   */
  connectTwitter(connector: TwitterConnector): void {
    this.twitter = connector;
  }

  /**
   * Check if content matches any keywords
   */
  private matchesKeywords(content: string): string | null {
    const lower = content.toLowerCase();
    for (const keyword of this.config.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return keyword;
      }
    }
    return null;
  }

  /**
   * Check Reddit for new relevant posts
   */
  private async checkReddit(): Promise<SocialMatch[]> {
    if (!this.reddit) return [];

    const matches: SocialMatch[] = [];

    for (const subreddit of this.config.subreddits) {
      try {
        const posts = await this.reddit.getNewPosts(subreddit, 25);

        for (const post of posts) {
          if (this.seenIds.has(post.id)) continue;
          this.seenIds.add(post.id);

          const matchedIn = this.matchesKeywords(post.title + ' ' + (post.selftext || ''));
          if (matchedIn) {
            matches.push({
              platform: 'reddit',
              type: 'post',
              id: post.id,
              content: post.title,
              author: post.author || 'unknown',
              url: `https://reddit.com${post.url || '/r/' + subreddit + '/comments/' + post.id.replace('t3_', '')}`,
              matchedKeyword: matchedIn,
              timestamp: post.createdUtc * 1000,
              metrics: {
                score: post.score,
                replies: post.numComments,
              },
            });
          }
        }
      } catch (error) {
        console.error(`Error checking r/${subreddit}:`, error);
      }
    }

    return matches;
  }

  /**
   * Check Twitter for relevant tweets
   */
  private async checkTwitter(): Promise<SocialMatch[]> {
    if (!this.twitter) return [];

    const matches: SocialMatch[] = [];

    for (const query of this.config.twitterQueries) {
      try {
        const sinceId = this.lastCheck.get(`twitter:${query}`);
        const tweets = await this.twitter.search({ query, maxResults: 20, sinceId });

        for (const tweet of tweets) {
          if (this.seenIds.has(tweet.id)) continue;
          this.seenIds.add(tweet.id);

          // Update last seen
          if (!sinceId || tweet.id > sinceId) {
            this.lastCheck.set(`twitter:${query}`, tweet.id);
          }

          const matchedIn = this.matchesKeywords(tweet.text);
          if (matchedIn || query.startsWith('@')) { // Include all if searching mentions
            matches.push({
              platform: 'twitter',
              type: 'tweet',
              id: tweet.id,
              content: tweet.text,
              author: tweet.author?.username || 'unknown',
              url: `https://twitter.com/${tweet.author?.username}/status/${tweet.id}`,
              matchedKeyword: matchedIn || query,
              timestamp: new Date(tweet.createdAt).getTime(),
              metrics: {
                likes: tweet.metrics?.like_count,
                replies: tweet.metrics?.reply_count,
              },
            });
          }
        }
      } catch (error) {
        console.error(`Error searching Twitter for "${query}":`, error);
      }
    }

    return matches;
  }

  /**
   * Run one monitoring cycle
   */
  async tick(): Promise<SocialMatch[]> {
    const allMatches: SocialMatch[] = [];

    const [redditMatches, twitterMatches] = await Promise.all([
      this.checkReddit(),
      this.checkTwitter(),
    ]);

    allMatches.push(...redditMatches, ...twitterMatches);

    // Call callback for each match
    for (const match of allMatches) {
      try {
        await this.config.onMatch(match);
      } catch (error) {
        console.error('Error in match callback:', error);
      }
    }

    return allMatches;
  }

  /**
   * Start continuous monitoring
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    console.log('Starting social monitor...');
    console.log('Keywords:', this.config.keywords.join(', '));
    console.log('Subreddits:', this.config.subreddits.join(', '));
    console.log('Twitter queries:', this.config.twitterQueries.join(', '));

    const loop = async () => {
      if (!this.running) return;

      try {
        const matches = await this.tick();
        if (matches.length > 0) {
          console.log(`Found ${matches.length} new matches`);
        }
      } catch (error) {
        console.error('Monitor tick error:', error);
      }

      setTimeout(loop, this.config.pollInterval);
    };

    loop();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.running = false;
    console.log('Monitor stopped');
  }

  /**
   * Get monitoring stats
   */
  getStats(): { running: boolean; seenCount: number; platforms: string[] } {
    const platforms: string[] = [];
    if (this.reddit) platforms.push('reddit');
    if (this.twitter) platforms.push('twitter');

    return {
      running: this.running,
      seenCount: this.seenIds.size,
      platforms,
    };
  }
}

// Example usage / main entry
async function main() {
  const monitor = new SocialMonitor({
    keywords: ['your-product', 'your-brand'],
    subreddits: ['startups', 'SideProject', 'indiehackers'],
    twitterQueries: ['your-product', '@yourhandle'],
    pollInterval: 5 * 60 * 1000, // 5 minutes
    onMatch: async (match) => {
      console.log(`\n=== New Match ===`);
      console.log(`Platform: ${match.platform}`);
      console.log(`Type: ${match.type}`);
      console.log(`Author: ${match.author}`);
      console.log(`Content: ${match.content.slice(0, 200)}...`);
      console.log(`URL: ${match.url}`);
      console.log(`Keyword: ${match.matchedKeyword}`);

      // Here you could:
      // - Send a Telegram notification
      // - Add to a response queue
      // - Log to analytics
      // - Auto-respond (carefully!)
    },
  });

  // Would connect platforms here with real credentials
  // monitor.connectReddit(redditConnector);
  // monitor.connectTwitter(twitterConnector);

  monitor.start();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
