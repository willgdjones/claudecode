/**
 * Profile Manager Module
 *
 * Manages multiple creator-style TikTok accounts for
 * distributed content posting and affiliate sales.
 */

import { v4 as uuidv4 } from 'uuid';
import { CreatorProfile, AccountCredentials, PostingSchedule } from '../types.js';

// ============================================================
// PROFILE TEMPLATES
// ============================================================

/**
 * Creator persona templates for different niches
 */
export const CREATOR_PERSONAS = {
  fitnessEnthusiast: {
    bioTemplate: '💪 Fitness journey | {product_type} enthusiast | Sharing what works',
    style: 'motivational, energetic',
    postingTimes: ['06:00', '12:00', '18:00'],
    hashtags: ['#fitnessmotivation', '#gymlife', '#healthylifestyle'],
  },
  skincareLover: {
    bioTemplate: '✨ Skincare addict | {product_type} reviews | Real results only',
    style: 'educational, honest',
    postingTimes: ['08:00', '20:00'],
    hashtags: ['#skincareroutine', '#beautytips', '#skincareobsessed'],
  },
  homeOrganizer: {
    bioTemplate: '🏠 Organization obsessed | {product_type} finds | Making life easier',
    style: 'helpful, relatable',
    postingTimes: ['09:00', '15:00', '21:00'],
    hashtags: ['#organizationhacks', '#homehacks', '#cleaningtok'],
  },
  techReviewer: {
    bioTemplate: '📱 Tech explorer | {product_type} reviews | No BS, just facts',
    style: 'informative, straightforward',
    postingTimes: ['10:00', '19:00'],
    hashtags: ['#techreview', '#gadgets', '#techtok'],
  },
  fashionFinder: {
    bioTemplate: '👗 Fashion finds | {product_type} hauls | Style on a budget',
    style: 'trendy, enthusiastic',
    postingTimes: ['11:00', '17:00', '20:00'],
    hashtags: ['#fashiontok', '#ootd', '#fashionfinds'],
  },
  momLife: {
    bioTemplate: '👶 Mom of {age_range} | {product_type} that actually work | Real reviews',
    style: 'relatable, honest',
    postingTimes: ['07:00', '13:00', '21:00'],
    hashtags: ['#momlife', '#momhacks', '#parentingtok'],
  },
  petParent: {
    bioTemplate: '🐕 Pet parent | {product_type} for fur babies | Tested & approved',
    style: 'warm, caring',
    postingTimes: ['08:00', '16:00', '20:00'],
    hashtags: ['#pettok', '#dogsoftiktok', '#petproducts'],
  },
  foodie: {
    bioTemplate: '🍳 Kitchen experiments | {product_type} reviews | Making cooking fun',
    style: 'fun, experimental',
    postingTimes: ['07:00', '12:00', '18:00'],
    hashtags: ['#foodtok', '#kitchengadgets', '#cookingathome'],
  },
};

// ============================================================
// PROFILE CREATION
// ============================================================

export interface CreateProfileParams {
  niche: string;
  persona: keyof typeof CREATOR_PERSONAS;
  productType: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  region?: string;
}

/**
 * Generate a creator profile based on persona
 */
export function generateCreatorProfile(params: CreateProfileParams): CreatorProfile {
  const { niche, persona, productType, platform, region = 'US' } = params;
  const personaTemplate = CREATOR_PERSONAS[persona];

  // Generate unique handle
  const handle = generateUniqueHandle(persona, productType);
  const displayName = generateDisplayName(persona, productType);

  // Generate bio from template
  const bio = personaTemplate.bioTemplate
    .replace('{product_type}', productType)
    .replace('{age_range}', '2');

  return {
    id: uuidv4(),
    platform,
    handle,
    displayName,
    bio,
    niche,
    style: personaTemplate.style,
    tiktokShopLinked: false,
    affiliateStatus: 'pending',
    createdAt: new Date().toISOString(),
    totalPosts: 0,
    totalViews: 0,
    totalGMV: 0,
  };
}

/**
 * Generate unique handle for creator profile
 */
function generateUniqueHandle(persona: string, productType: string): string {
  const prefixes = ['the', 'just', 'real', 'daily', 'your'];
  const suffixes = ['finds', 'picks', 'reviews', 'life', 'world'];

  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  const randomNum = Math.floor(Math.random() * 999);

  const cleanProduct = productType.toLowerCase().replace(/\s+/g, '');

  return `${prefix}${cleanProduct}${suffix}${randomNum}`;
}

/**
 * Generate display name for creator profile
 */
function generateDisplayName(persona: string, productType: string): string {
  const templates = [
    '{type} Reviews',
    '{type} Finds ✨',
    'Your {type} Guide',
    '{type} Daily',
    'Real {type} Talk',
  ];

  const template = templates[Math.floor(Math.random() * templates.length)];
  const capitalizedType = productType.charAt(0).toUpperCase() + productType.slice(1);

  return template.replace('{type}', capitalizedType);
}

// ============================================================
// PROFILE MANAGEMENT
// ============================================================

export interface ProfileManagerState {
  profiles: Map<string, CreatorProfile>;
  credentials: Map<string, AccountCredentials>;
  schedules: Map<string, PostingSchedule>;
}

/**
 * Create a new profile manager instance
 */
export function createProfileManager(): ProfileManagerState {
  return {
    profiles: new Map(),
    credentials: new Map(),
    schedules: new Map(),
  };
}

/**
 * Add profile to manager
 */
export function addProfile(
  state: ProfileManagerState,
  profile: CreatorProfile
): ProfileManagerState {
  state.profiles.set(profile.id, profile);
  return state;
}

/**
 * Get all active profiles
 */
export function getActiveProfiles(state: ProfileManagerState): CreatorProfile[] {
  return Array.from(state.profiles.values()).filter(
    profile => profile.affiliateStatus === 'approved'
  );
}

/**
 * Get profiles by platform
 */
export function getProfilesByPlatform(
  state: ProfileManagerState,
  platform: string
): CreatorProfile[] {
  return Array.from(state.profiles.values()).filter(
    profile => profile.platform === platform
  );
}

/**
 * Update profile metrics
 */
export function updateProfileMetrics(
  state: ProfileManagerState,
  profileId: string,
  metrics: {
    views?: number;
    posts?: number;
    gmv?: number;
    lastPostAt?: string;
  }
): ProfileManagerState {
  const profile = state.profiles.get(profileId);
  if (profile) {
    if (metrics.views) profile.totalViews += metrics.views;
    if (metrics.posts) profile.totalPosts += metrics.posts;
    if (metrics.gmv) profile.totalGMV += metrics.gmv;
    if (metrics.lastPostAt) profile.lastPostAt = metrics.lastPostAt;
    state.profiles.set(profileId, profile);
  }
  return state;
}

// ============================================================
// POSTING SCHEDULE MANAGEMENT
// ============================================================

/**
 * Create posting schedule for a profile
 */
export function createPostingSchedule(
  profileId: string,
  persona: keyof typeof CREATOR_PERSONAS,
  postsPerDay: number = 3
): PostingSchedule {
  const personaTemplate = CREATOR_PERSONAS[persona];

  return {
    profileId,
    timezone: 'America/New_York',
    postsPerDay,
    optimalTimes: personaTemplate.postingTimes.slice(0, postsPerDay),
    daysActive: [0, 1, 2, 3, 4, 5, 6], // All days
  };
}

/**
 * Get optimal posting times for a profile
 */
export function getOptimalPostingTimes(
  schedule: PostingSchedule,
  date: Date = new Date()
): Date[] {
  const dayOfWeek = date.getDay();

  if (!schedule.daysActive.includes(dayOfWeek)) {
    return [];
  }

  return schedule.optimalTimes.map(time => {
    const [hours, minutes] = time.split(':').map(Number);
    const postTime = new Date(date);
    postTime.setHours(hours, minutes, 0, 0);
    return postTime;
  });
}

// ============================================================
// BATCH PROFILE CREATION
// ============================================================

export interface BatchProfileParams {
  count: number;
  niche: string;
  productType: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  personas?: (keyof typeof CREATOR_PERSONAS)[];
}

/**
 * Generate multiple creator profiles for a campaign
 */
export function generateBatchProfiles(params: BatchProfileParams): CreatorProfile[] {
  const { count, niche, productType, platform, personas } = params;
  const profiles: CreatorProfile[] = [];

  // Default to all personas if not specified
  const availablePersonas = personas || Object.keys(CREATOR_PERSONAS) as (keyof typeof CREATOR_PERSONAS)[];

  for (let i = 0; i < count; i++) {
    const persona = availablePersonas[i % availablePersonas.length];
    const profile = generateCreatorProfile({
      niche,
      persona,
      productType,
      platform,
    });
    profiles.push(profile);
  }

  return profiles;
}

// ============================================================
// PROFILE SETUP PROMPTS
// ============================================================

/**
 * Generate TikTok account setup checklist
 */
export function generateAccountSetupPrompt(
  profiles: CreatorProfile[]
): string {
  return `
# TikTok Shop Creator Account Setup

## Accounts to Create
${profiles.map((p, i) => `
### Account ${i + 1}
- **Handle:** @${p.handle}
- **Display Name:** ${p.displayName}
- **Bio:** ${p.bio}
- **Niche:** ${p.niche}
- **Style:** ${p.style}
`).join('\n')}

## Setup Checklist for Each Account

### 1. Account Creation
- [ ] Create new TikTok account
- [ ] Set handle as specified
- [ ] Set display name
- [ ] Write bio as specified
- [ ] Upload profile photo (UGC style selfie)

### 2. Profile Optimization
- [ ] Add profile links (if available)
- [ ] Set account to Creator account
- [ ] Enable monetization features
- [ ] Complete verification if possible

### 3. TikTok Shop Integration
- [ ] Apply for TikTok Shop Affiliate
- [ ] Connect to product catalog
- [ ] Set up commission structure
- [ ] Test product tagging

### 4. Content Setup
- [ ] Post 3-5 initial videos (warm-up content)
- [ ] Engage with niche content
- [ ] Follow relevant accounts
- [ ] Use niche hashtags

### 5. Automation Prep
- [ ] Note down account credentials securely
- [ ] Test posting API access
- [ ] Configure posting schedule
- [ ] Set up analytics tracking

## Phone Network Requirements
For phone-based posting automation:
- Unique IP per account (or max 3 accounts per IP)
- Real device or high-quality emulator
- Residential IP preferred over datacenter
- Regular session maintenance
- Avoid posting identical content across accounts

## Account Health Guidelines
- Post 1-3 times daily (consistency over volume)
- Maintain 30% original content minimum
- Engage genuinely with comments
- Avoid posting exact duplicates
- Space posts 4+ hours apart
- Don't link multiple accounts publicly
`;
}

/**
 * Generate affiliate application templates
 */
export function generateAffiliateApplicationPrompt(
  profile: CreatorProfile,
  products: string[]
): string {
  return `
# TikTok Shop Affiliate Application

## Profile Information
- **Handle:** @${profile.handle}
- **Niche:** ${profile.niche}
- **Content Style:** ${profile.style}

## Application Message Template

"Hi! I'm a content creator focused on ${profile.niche} with a passion for finding products that genuinely help people.

I create authentic, UGC-style content that showcases products in real-life situations. My audience trusts my honest reviews and recommendations.

I'm interested in promoting the following products:
${products.map(p => `- ${p}`).join('\n')}

I plan to create:
- Product demonstration videos
- Before/after transformations
- Honest reviews and comparisons
- Daily use showcases

I believe my authentic style aligns well with TikTok Shop's community and I'm excited to partner with quality brands."

## Content Examples to Include
- 3 sample videos in planned content style
- Engagement metrics from any existing content
- Audience demographics (if available)

## Follow-up Timeline
- Apply: Day 1
- Follow up if no response: Day 7
- Create sample content: Day 1-3
- Start posting after approval
`;
}

export default {
  CREATOR_PERSONAS,
  generateCreatorProfile,
  createProfileManager,
  addProfile,
  getActiveProfiles,
  getProfilesByPlatform,
  updateProfileMetrics,
  createPostingSchedule,
  getOptimalPostingTimes,
  generateBatchProfiles,
  generateAccountSetupPrompt,
  generateAffiliateApplicationPrompt,
};
