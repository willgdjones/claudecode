/**
 * Posting Scheduler Module
 *
 * Automates content posting across multiple TikTok accounts
 * with optimal timing and queue management.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Post,
  PostingSchedule,
  CreatorProfile,
  GeneratedVideo,
  Product,
} from '../types.js';

// ============================================================
// SCHEDULING CONFIGURATION
// ============================================================

export interface SchedulerConfig {
  maxPostsPerAccountPerDay: number;
  minTimeBetweenPosts: number; // minutes
  maxConcurrentPosts: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxPostsPerAccountPerDay: 3,
  minTimeBetweenPosts: 240, // 4 hours
  maxConcurrentPosts: 5,
  retryAttempts: 3,
  retryDelayMs: 30000,
};

// ============================================================
// OPTIMAL POSTING TIMES
// ============================================================

/**
 * Best posting times by day of week and niche
 */
export const OPTIMAL_POSTING_TIMES: Record<string, Record<number, string[]>> = {
  general: {
    0: ['10:00', '14:00', '19:00'], // Sunday
    1: ['07:00', '12:00', '19:00'], // Monday
    2: ['07:00', '12:00', '19:00'], // Tuesday
    3: ['07:00', '12:00', '22:00'], // Wednesday (best day)
    4: ['07:00', '12:00', '17:00'], // Thursday
    5: ['09:00', '12:00', '15:00'], // Friday
    6: ['10:00', '14:00', '19:00'], // Saturday
  },
  beauty: {
    0: ['11:00', '15:00', '20:00'],
    1: ['08:00', '12:00', '20:00'],
    2: ['08:00', '12:00', '20:00'],
    3: ['08:00', '12:00', '21:00'],
    4: ['08:00', '12:00', '18:00'],
    5: ['10:00', '14:00', '17:00'],
    6: ['11:00', '15:00', '20:00'],
  },
  fitness: {
    0: ['06:00', '10:00', '18:00'],
    1: ['05:30', '12:00', '18:00'],
    2: ['05:30', '12:00', '18:00'],
    3: ['05:30', '12:00', '19:00'],
    4: ['05:30', '12:00', '18:00'],
    5: ['06:00', '12:00', '16:00'],
    6: ['07:00', '11:00', '17:00'],
  },
  home: {
    0: ['09:00', '14:00', '20:00'],
    1: ['07:00', '13:00', '20:00'],
    2: ['07:00', '13:00', '20:00'],
    3: ['07:00', '13:00', '21:00'],
    4: ['07:00', '13:00', '19:00'],
    5: ['09:00', '13:00', '16:00'],
    6: ['09:00', '14:00', '20:00'],
  },
};

/**
 * Get optimal posting times for a specific date and niche
 */
export function getOptimalTimes(date: Date, niche: string): Date[] {
  const dayOfWeek = date.getDay();
  const nicheTimes = OPTIMAL_POSTING_TIMES[niche.toLowerCase()] || OPTIMAL_POSTING_TIMES.general;
  const times = nicheTimes[dayOfWeek];

  return times.map(time => {
    const [hours, minutes] = time.split(':').map(Number);
    const postTime = new Date(date);
    postTime.setHours(hours, minutes, 0, 0);
    return postTime;
  });
}

// ============================================================
// POST QUEUE MANAGEMENT
// ============================================================

export interface PostQueue {
  posts: Post[];
  nextPostTime: Map<string, Date>; // profileId -> next available time
  dailyPostCount: Map<string, number>; // profileId -> count today
}

/**
 * Create a new post queue
 */
export function createPostQueue(): PostQueue {
  return {
    posts: [],
    nextPostTime: new Map(),
    dailyPostCount: new Map(),
  };
}

/**
 * Schedule a post for a specific profile
 */
export function schedulePost(
  queue: PostQueue,
  profile: CreatorProfile,
  video: GeneratedVideo,
  product: Partial<Product>,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG
): Post | null {
  // Check daily limit
  const todayCount = queue.dailyPostCount.get(profile.id) || 0;
  if (todayCount >= config.maxPostsPerAccountPerDay) {
    console.log(`Daily limit reached for profile ${profile.handle}`);
    return null;
  }

  // Calculate next available time
  const lastPostTime = queue.nextPostTime.get(profile.id);
  let scheduledTime: Date;

  if (lastPostTime) {
    scheduledTime = new Date(lastPostTime.getTime() + config.minTimeBetweenPosts * 60000);
  } else {
    // Get next optimal time
    const optimalTimes = getOptimalTimes(new Date(), profile.niche);
    const now = new Date();
    scheduledTime = optimalTimes.find(t => t > now) || optimalTimes[0];

    // If all times passed, schedule for tomorrow
    if (scheduledTime < now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
  }

  const post: Post = {
    id: uuidv4(),
    profileId: profile.id,
    videoId: video.id,
    platform: profile.platform,
    caption: generateCaption(product, video),
    hashtags: generatePostHashtags(product, profile.niche),
    productLinks: product.tiktokShopUrl ? [product.tiktokShopUrl] : [],
    scheduledAt: scheduledTime.toISOString(),
    status: 'scheduled',
  };

  // Update queue
  queue.posts.push(post);
  queue.nextPostTime.set(profile.id, scheduledTime);
  queue.dailyPostCount.set(profile.id, todayCount + 1);

  return post;
}

/**
 * Generate post caption for TikTok Shop
 */
function generateCaption(product: Partial<Product>, video: GeneratedVideo): string {
  const templates = [
    `Found the best ${product.category}! 🔥 Link in bio for this game-changer`,
    `POV: You finally found a ${product.category} that actually works ✨`,
    `This ${product.category} is going viral for a reason 👀`,
    `Not me becoming obsessed with this ${product.category} 🙈`,
    `The ${product.category} that's changing everything 💫`,
    `Trust me when I say you NEED this ${product.category} 💕`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Generate hashtags for a post
 */
function generatePostHashtags(product: Partial<Product>, niche: string): string[] {
  const base = ['#fyp', '#foryou', '#tiktokshop', '#tiktokmademebuyit'];

  const nicheHashtags: Record<string, string[]> = {
    beauty: ['#beautytok', '#skincare', '#makeup', '#beautyhacks'],
    fitness: ['#fitnesstok', '#workout', '#gym', '#healthtok'],
    home: ['#hometok', '#homehacks', '#organization', '#cleaning'],
    tech: ['#techtok', '#gadgets', '#techfinds', '#innovation'],
    fashion: ['#fashiontok', '#ootd', '#style', '#fashion'],
  };

  const categoryTags = nicheHashtags[niche.toLowerCase()] || ['#trending', '#viral'];
  const productTag = `#${product.name?.replace(/\s+/g, '').toLowerCase() || 'product'}`;

  return [...base, ...categoryTags, productTag].slice(0, 8);
}

// ============================================================
// BATCH SCHEDULING
// ============================================================

export interface BatchScheduleParams {
  profiles: CreatorProfile[];
  videos: GeneratedVideo[];
  product: Partial<Product>;
  startDate: Date;
  daysToSchedule: number;
  postsPerDay: number;
}

/**
 * Schedule posts across multiple profiles for multiple days
 */
export function scheduleBatchPosts(params: BatchScheduleParams): Post[] {
  const {
    profiles,
    videos,
    product,
    startDate,
    daysToSchedule,
    postsPerDay,
  } = params;

  const queue = createPostQueue();
  const allPosts: Post[] = [];
  let videoIndex = 0;

  for (let day = 0; day < daysToSchedule; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + day);

    // Reset daily counts for new day
    queue.dailyPostCount.clear();

    for (const profile of profiles) {
      for (let postNum = 0; postNum < postsPerDay; postNum++) {
        const video = videos[videoIndex % videos.length];
        videoIndex++;

        const post = schedulePost(queue, profile, video, product);
        if (post) {
          // Adjust to current day
          const postTime = new Date(post.scheduledAt);
          postTime.setDate(currentDate.getDate());
          postTime.setMonth(currentDate.getMonth());
          postTime.setFullYear(currentDate.getFullYear());
          post.scheduledAt = postTime.toISOString();

          allPosts.push(post);
        }
      }
    }
  }

  return allPosts;
}

// ============================================================
// POST EXECUTION
// ============================================================

export interface PostingResult {
  postId: string;
  success: boolean;
  postUrl?: string;
  error?: string;
  timestamp: string;
}

/**
 * Execute a scheduled post (placeholder for actual posting logic)
 */
export async function executePost(
  post: Post,
  profile: CreatorProfile
): Promise<PostingResult> {
  console.log(`Executing post ${post.id} for profile ${profile.handle}`);
  console.log(`Platform: ${post.platform}`);
  console.log(`Video: ${post.videoId}`);
  console.log(`Caption: ${post.caption}`);
  console.log(`Hashtags: ${post.hashtags.join(' ')}`);

  // In production, this would:
  // 1. Connect to the posting API or automation tool
  // 2. Upload the video
  // 3. Set caption and hashtags
  // 4. Add product links
  // 5. Post at scheduled time

  // Placeholder response
  return {
    postId: post.id,
    success: true,
    postUrl: `https://tiktok.com/@${profile.handle}/video/${post.id}`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Process scheduled posts that are due
 */
export async function processScheduledPosts(
  queue: PostQueue,
  profiles: Map<string, CreatorProfile>,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG
): Promise<PostingResult[]> {
  const now = new Date();
  const results: PostingResult[] = [];

  // Find posts that are due
  const duePosts = queue.posts.filter(
    post => post.status === 'scheduled' && new Date(post.scheduledAt) <= now
  );

  // Process up to maxConcurrentPosts at a time
  const postsToProcess = duePosts.slice(0, config.maxConcurrentPosts);

  for (const post of postsToProcess) {
    const profile = profiles.get(post.profileId);
    if (!profile) {
      results.push({
        postId: post.id,
        success: false,
        error: 'Profile not found',
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    // Mark as posting
    post.status = 'posting';

    let result: PostingResult;
    let attempts = 0;

    while (attempts < config.retryAttempts) {
      try {
        result = await executePost(post, profile);
        if (result.success) {
          post.status = 'posted';
          post.postedAt = result.timestamp;
          post.postUrl = result.postUrl;
          break;
        }
      } catch (error) {
        attempts++;
        if (attempts < config.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, config.retryDelayMs));
        }
      }
    }

    if (!result! || !result.success) {
      post.status = 'failed';
      result = {
        postId: post.id,
        success: false,
        error: 'Max retry attempts reached',
        timestamp: new Date().toISOString(),
      };
    }

    results.push(result);
  }

  return results;
}

// ============================================================
// SCHEDULING PROMPTS
// ============================================================

/**
 * Generate posting schedule overview
 */
export function generateScheduleOverview(
  posts: Post[],
  profiles: Map<string, CreatorProfile>
): string {
  const byDate = new Map<string, Post[]>();

  // Group posts by date
  for (const post of posts) {
    const date = post.scheduledAt.split('T')[0];
    if (!byDate.has(date)) {
      byDate.set(date, []);
    }
    byDate.get(date)!.push(post);
  }

  let output = `
# Posting Schedule Overview

## Summary
- Total Posts Scheduled: ${posts.length}
- Profiles Active: ${new Set(posts.map(p => p.profileId)).size}
- Days Covered: ${byDate.size}

## Daily Breakdown
`;

  for (const [date, dayPosts] of Array.from(byDate.entries()).sort()) {
    output += `\n### ${date}\n`;

    for (const post of dayPosts.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))) {
      const profile = profiles.get(post.profileId);
      const time = post.scheduledAt.split('T')[1].substring(0, 5);
      output += `- **${time}** | @${profile?.handle || 'unknown'} | ${post.caption.substring(0, 30)}...\n`;
    }
  }

  return output;
}

/**
 * Generate phone posting network setup instructions
 */
export function generatePhoneNetworkSetupPrompt(
  profileCount: number,
  postsPerDay: number
): string {
  const phonesNeeded = Math.ceil(profileCount / 3); // Max 3 accounts per phone

  return `
# Phone Posting Network Setup

## Requirements Overview
- **Total Profiles:** ${profileCount}
- **Posts Per Day Per Profile:** ${postsPerDay}
- **Total Daily Posts:** ${profileCount * postsPerDay}
- **Phones Needed:** ${phonesNeeded} (max 3 accounts per phone)

## Hardware Setup

### Phone Requirements (Per Device)
- Android 10+ or iOS 14+
- Minimum 4GB RAM
- 64GB storage minimum
- Good camera (for any live content)
- Stable internet connection

### Network Requirements
- **Unique IPs:** ${phonesNeeded} residential IPs
- Mobile data or residential WiFi
- VPN only if needed for region
- Avoid datacenter proxies

## Software Setup

### On Each Phone
1. Factory reset phone
2. Create new Google/Apple account
3. Install TikTok fresh
4. Install automation app (if using)
5. Disable unnecessary apps

### Automation Options
1. **Native Posting** (Manual)
   - Use content calendar app
   - Set reminders for posting times
   - Manual upload and caption

2. **Semi-Automated** (Recommended)
   - Use scheduling tools
   - Pre-upload content
   - Auto-publish at set times

3. **Full Automation** (Advanced)
   - Custom posting scripts
   - Phone farm management
   - Requires technical setup

## Account Assignment

### Phone 1 (Accounts 1-3)
${[1, 2, 3].map(i => `- Account ${i}: @account${i}`).join('\n')}

### Phone 2 (Accounts 4-6)
${[4, 5, 6].map(i => `- Account ${i}: @account${i}`).join('\n')}

[Continue for remaining phones...]

## Daily Operations

### Morning (6:00-8:00 AM)
- Check all accounts logged in
- Verify scheduling queue
- Clear any blocked posts

### Midday (12:00-1:00 PM)
- Monitor morning post performance
- Respond to comments
- Check account health

### Evening (6:00-8:00 PM)
- Review day's performance
- Queue tomorrow's content
- Engage with comments

### Safety Guidelines
- Never post identical content simultaneously
- Maintain 4+ hour gaps between posts
- Rotate content across accounts
- Keep 30%+ original content per account
- Engage authentically with comments
- Monitor for shadowban indicators
`;
}

export default {
  OPTIMAL_POSTING_TIMES,
  DEFAULT_SCHEDULER_CONFIG,
  getOptimalTimes,
  createPostQueue,
  schedulePost,
  scheduleBatchPosts,
  executePost,
  processScheduledPosts,
  generateScheduleOverview,
  generatePhoneNetworkSetupPrompt,
};
