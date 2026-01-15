/**
 * Multi-Platform Swarm (MPS) Module
 *
 * Deploys content variations across multiple platforms and accounts
 * to maximize reach and drive traffic back to TikTok Shop and Amazon.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  SwarmCampaign,
  GeneratedVideo,
  ContentBrief,
  Product,
  CreatorProfile,
  Post,
} from '../types.js';

// ============================================================
// PLATFORM CONFIGURATIONS
// ============================================================

export interface PlatformConfig {
  name: string;
  maxVideoDuration: number;
  aspectRatio: '9:16' | '1:1' | '16:9';
  maxCaptionLength: number;
  maxHashtags: number;
  linkInBio: boolean;
  shoppableLinks: boolean;
  optimalPostTimes: string[];
}

export const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  tiktok: {
    name: 'TikTok',
    maxVideoDuration: 180,
    aspectRatio: '9:16',
    maxCaptionLength: 2200,
    maxHashtags: 8,
    linkInBio: true,
    shoppableLinks: true,
    optimalPostTimes: ['07:00', '12:00', '19:00', '22:00'],
  },
  instagram: {
    name: 'Instagram Reels',
    maxVideoDuration: 90,
    aspectRatio: '9:16',
    maxCaptionLength: 2200,
    maxHashtags: 30,
    linkInBio: true,
    shoppableLinks: true,
    optimalPostTimes: ['08:00', '11:00', '14:00', '19:00'],
  },
  'youtube-shorts': {
    name: 'YouTube Shorts',
    maxVideoDuration: 60,
    aspectRatio: '9:16',
    maxCaptionLength: 100,
    maxHashtags: 15,
    linkInBio: true,
    shoppableLinks: false,
    optimalPostTimes: ['09:00', '12:00', '15:00', '21:00'],
  },
  facebook: {
    name: 'Facebook Reels',
    maxVideoDuration: 90,
    aspectRatio: '9:16',
    maxCaptionLength: 2200,
    maxHashtags: 10,
    linkInBio: false,
    shoppableLinks: true,
    optimalPostTimes: ['08:00', '13:00', '16:00', '20:00'],
  },
  pinterest: {
    name: 'Pinterest Idea Pins',
    maxVideoDuration: 60,
    aspectRatio: '9:16',
    maxCaptionLength: 500,
    maxHashtags: 10,
    linkInBio: true,
    shoppableLinks: true,
    optimalPostTimes: ['10:00', '14:00', '20:00'],
  },
};

// ============================================================
// CONTENT VARIATION GENERATORS
// ============================================================

export interface ContentVariation {
  id: string;
  originalBriefId: string;
  platform: string;
  hookVariation: string;
  captionVariation: string;
  hashtagVariation: string[];
  ctaVariation: string;
  productLinkPlacement: 'bio' | 'caption' | 'sticker' | 'shop';
}

/**
 * Hook variation templates for different platforms
 */
const HOOK_VARIATIONS: Record<string, string[]> = {
  curiosity: [
    'Wait until you see this...',
    'I can\'t believe I found this',
    'You\'re gonna want to see this',
    'This is gonna change everything',
  ],
  controversy: [
    'Nobody is talking about this',
    'Unpopular opinion but...',
    'Hot take:',
    'I know this might be controversial but...',
  ],
  question: [
    'Did you know about this?',
    'Have you tried this yet?',
    'Why is everyone switching to this?',
    'What if I told you...',
  ],
  social: [
    'This went viral for a reason',
    'TikTok made me buy it',
    'Everyone is buying this',
    'The hype is real',
  ],
  transformation: [
    'Before vs After',
    'Day 1 vs Day 30',
    'Watch this transformation',
    'The results speak for themselves',
  ],
};

/**
 * Generate hook variations for a content piece
 */
export function generateHookVariations(
  originalHook: string,
  count: number
): string[] {
  const variations: string[] = [originalHook];

  // Detect original hook type
  const hookType = detectHookType(originalHook);
  const templates = HOOK_VARIATIONS[hookType] || HOOK_VARIATIONS.curiosity;

  while (variations.length < count) {
    const template = templates[variations.length % templates.length];
    if (!variations.includes(template)) {
      variations.push(template);
    }
  }

  return variations.slice(0, count);
}

/**
 * Detect the type of hook from text
 */
function detectHookType(hook: string): string {
  const lower = hook.toLowerCase();

  if (lower.includes('?')) return 'question';
  if (lower.includes('unpopular') || lower.includes('controversial')) return 'controversy';
  if (lower.includes('viral') || lower.includes('everyone')) return 'social';
  if (lower.includes('before') || lower.includes('after') || lower.includes('transformation')) return 'transformation';

  return 'curiosity';
}

/**
 * Generate platform-specific caption variation
 */
export function generateCaptionVariation(
  originalCaption: string,
  platform: string,
  product: Partial<Product>
): string {
  const config = PLATFORM_CONFIGS[platform];

  // Platform-specific CTA additions
  const ctaAdditions: Record<string, string> = {
    tiktok: '\n\n🛒 Tap the link to shop!',
    instagram: '\n\n🔗 Link in bio!',
    'youtube-shorts': '\n\nLink in description!',
    facebook: '\n\n🛍️ Shop now!',
    pinterest: '\n\n📌 Save for later!',
  };

  let caption = originalCaption;

  // Truncate if needed
  const maxLength = config.maxCaptionLength - (ctaAdditions[platform]?.length || 0) - 50;
  if (caption.length > maxLength) {
    caption = caption.substring(0, maxLength) + '...';
  }

  // Add platform-specific CTA
  caption += ctaAdditions[platform] || '';

  return caption;
}

/**
 * Generate platform-specific hashtags
 */
export function generatePlatformHashtags(
  baseHashtags: string[],
  platform: string,
  niche: string
): string[] {
  const config = PLATFORM_CONFIGS[platform];

  const platformSpecificTags: Record<string, string[]> = {
    tiktok: ['#fyp', '#foryou', '#tiktokshop', '#tiktokmademebuyit'],
    instagram: ['#reels', '#reelsinstagram', '#instareels', '#explore'],
    'youtube-shorts': ['#shorts', '#youtubeshorts', '#shortsviral'],
    facebook: ['#reels', '#facebookreels', '#fbreels'],
    pinterest: ['#pinterestfinds', '#pinterestinspired'],
  };

  const platformTags = platformSpecificTags[platform] || [];
  const combinedTags = [...new Set([...platformTags, ...baseHashtags])];

  return combinedTags.slice(0, config.maxHashtags);
}

// ============================================================
// SWARM CAMPAIGN MANAGEMENT
// ============================================================

export interface SwarmDeploymentParams {
  contentBrief: ContentBrief;
  video: GeneratedVideo;
  product: Partial<Product>;
  targetPlatforms: string[];
  accountsPerPlatform: number;
  variationsPerAccount: number;
  deploymentStrategy: 'simultaneous' | 'staggered' | 'wave';
}

/**
 * Create a multi-platform swarm campaign
 */
export function createSwarmCampaign(params: SwarmDeploymentParams): SwarmCampaign {
  const {
    contentBrief,
    video,
    product,
    targetPlatforms,
    accountsPerPlatform,
    variationsPerAccount,
    deploymentStrategy,
  } = params;

  const variations: SwarmCampaign['variations'] = [];

  // Generate variations for each platform
  for (const platform of targetPlatforms) {
    const hookVariations = generateHookVariations(
      contentBrief.hook.text,
      accountsPerPlatform * variationsPerAccount
    );

    for (let i = 0; i < accountsPerPlatform * variationsPerAccount; i++) {
      variations.push({
        id: uuidv4(),
        hookVariation: hookVariations[i % hookVariations.length],
        visualVariation: `Variation ${i + 1} - ${platform}`,
        platform,
        status: 'pending',
      });
    }
  }

  return {
    id: uuidv4(),
    name: `Swarm: ${product.name} - ${contentBrief.title}`,
    productId: product.id || uuidv4(),
    originalVideoId: video.id,
    variations,
    targetPlatforms,
    targetAccounts: [], // Will be populated during deployment
    deploymentStrategy,
    startDate: new Date().toISOString(),
    metrics: {
      totalViews: 0,
      totalEngagement: 0,
      totalGMV: 0,
    },
  };
}

/**
 * Calculate deployment schedule based on strategy
 */
export function calculateDeploymentSchedule(
  campaign: SwarmCampaign,
  startTime: Date
): Map<string, Date> {
  const schedule = new Map<string, Date>();

  const { deploymentStrategy, variations } = campaign;

  switch (deploymentStrategy) {
    case 'simultaneous':
      // All variations deploy at the same time
      for (const variation of variations) {
        schedule.set(variation.id, new Date(startTime));
      }
      break;

    case 'staggered':
      // Deploy variations 30 minutes apart
      let staggeredTime = new Date(startTime);
      for (const variation of variations) {
        schedule.set(variation.id, new Date(staggeredTime));
        staggeredTime = new Date(staggeredTime.getTime() + 30 * 60000);
      }
      break;

    case 'wave':
      // Deploy in waves - each platform in sequence
      let waveTime = new Date(startTime);
      const platformGroups = new Map<string, typeof variations>();

      // Group by platform
      for (const variation of variations) {
        if (!platformGroups.has(variation.platform)) {
          platformGroups.set(variation.platform, []);
        }
        platformGroups.get(variation.platform)!.push(variation);
      }

      // Schedule each platform wave
      for (const [_, platformVariations] of platformGroups) {
        for (const variation of platformVariations) {
          schedule.set(variation.id, new Date(waveTime));
          waveTime = new Date(waveTime.getTime() + 15 * 60000); // 15 min within wave
        }
        waveTime = new Date(waveTime.getTime() + 4 * 60 * 60000); // 4 hours between waves
      }
      break;
  }

  return schedule;
}

// ============================================================
// CROSS-PLATFORM LINK STRATEGY
// ============================================================

export interface LinkStrategy {
  platform: string;
  primaryLink: string;
  backupLinks: string[];
  linkPlacement: string;
  trackingParams: string;
}

/**
 * Generate link strategy for cross-platform traffic
 */
export function generateLinkStrategy(
  product: Partial<Product>,
  platforms: string[]
): LinkStrategy[] {
  const strategies: LinkStrategy[] = [];

  for (const platform of platforms) {
    const config = PLATFORM_CONFIGS[platform];

    let primaryLink: string;
    let linkPlacement: string;

    if (platform === 'tiktok' && product.tiktokShopUrl) {
      primaryLink = product.tiktokShopUrl;
      linkPlacement = 'Product tag + bio';
    } else if (product.amazonUrl) {
      primaryLink = product.amazonUrl;
      linkPlacement = config.linkInBio ? 'Bio link' : 'Caption';
    } else {
      primaryLink = product.tiktokShopUrl || '';
      linkPlacement = 'Bio';
    }

    strategies.push({
      platform,
      primaryLink,
      backupLinks: [product.amazonUrl, product.tiktokShopUrl].filter(Boolean) as string[],
      linkPlacement,
      trackingParams: `?utm_source=${platform}&utm_medium=social&utm_campaign=swarm`,
    });
  }

  return strategies;
}

// ============================================================
// SWARM ANALYTICS
// ============================================================

export interface SwarmMetrics {
  campaignId: string;
  platformBreakdown: Record<string, {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    conversions: number;
    gmv: number;
  }>;
  topPerformingVariation: string;
  bestPlatform: string;
  totalROI: number;
}

/**
 * Calculate swarm campaign metrics
 */
export function calculateSwarmMetrics(
  campaign: SwarmCampaign,
  postMetrics: Map<string, Post['metrics']>
): SwarmMetrics {
  const platformBreakdown: SwarmMetrics['platformBreakdown'] = {};

  let topViews = 0;
  let topVariation = '';
  let bestPlatformViews = 0;
  let bestPlatform = '';

  for (const variation of campaign.variations) {
    const metrics = postMetrics.get(variation.id);
    if (!metrics) continue;

    // Initialize platform if needed
    if (!platformBreakdown[variation.platform]) {
      platformBreakdown[variation.platform] = {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        clicks: 0,
        conversions: 0,
        gmv: 0,
      };
    }

    // Aggregate metrics
    const pb = platformBreakdown[variation.platform];
    pb.views += metrics.views;
    pb.likes += metrics.likes;
    pb.comments += metrics.comments;
    pb.shares += metrics.shares;
    pb.clicks += metrics.clicks || 0;
    pb.conversions += metrics.purchases || 0;
    pb.gmv += metrics.gmv || 0;

    // Track top performer
    if (metrics.views > topViews) {
      topViews = metrics.views;
      topVariation = variation.id;
    }
  }

  // Find best platform
  for (const [platform, metrics] of Object.entries(platformBreakdown)) {
    if (metrics.views > bestPlatformViews) {
      bestPlatformViews = metrics.views;
      bestPlatform = platform;
    }
  }

  // Calculate total GMV
  const totalGMV = Object.values(platformBreakdown).reduce((sum, p) => sum + p.gmv, 0);

  return {
    campaignId: campaign.id,
    platformBreakdown,
    topPerformingVariation: topVariation,
    bestPlatform,
    totalROI: totalGMV, // Simplified - would calculate against cost in production
  };
}

// ============================================================
// SWARM DEPLOYMENT PROMPTS
// ============================================================

/**
 * Generate swarm deployment instructions
 */
export function generateSwarmDeploymentPrompt(
  campaign: SwarmCampaign,
  profiles: CreatorProfile[],
  product: Partial<Product>
): string {
  const schedule = calculateDeploymentSchedule(campaign, new Date());
  const linkStrategies = generateLinkStrategy(product, campaign.targetPlatforms);

  return `
# Multi-Platform Swarm Deployment

## Campaign: ${campaign.name}
**Product:** ${product.name}
**Strategy:** ${campaign.deploymentStrategy}
**Start:** ${campaign.startDate}

## Platforms & Accounts

${campaign.targetPlatforms.map(platform => {
  const platformProfiles = profiles.filter(p => p.platform === platform);
  const platformVariations = campaign.variations.filter(v => v.platform === platform);

  return `
### ${PLATFORM_CONFIGS[platform]?.name || platform}
**Accounts:** ${platformProfiles.length}
**Variations:** ${platformVariations.length}

${platformProfiles.map((profile, i) => `
- @${profile.handle}
  - Variation: "${platformVariations[i]?.hookVariation || 'Default'}"
  - Deploy: ${schedule.get(platformVariations[i]?.id)?.toISOString() || 'TBD'}
`).join('')}
`;
}).join('\n')}

## Link Strategy

${linkStrategies.map(strategy => `
### ${strategy.platform}
- **Primary Link:** ${strategy.primaryLink}${strategy.trackingParams}
- **Placement:** ${strategy.linkPlacement}
- **Backup:** ${strategy.backupLinks.join(', ')}
`).join('')}

## Content Variations

${campaign.variations.map((v, i) => `
### Variation ${i + 1} (${v.platform})
- **Hook:** ${v.hookVariation}
- **Status:** ${v.status}
- **Deploy Time:** ${schedule.get(v.id)?.toISOString() || 'TBD'}
`).join('')}

## Deployment Checklist

### Pre-Deployment
- [ ] All content variations generated
- [ ] All accounts logged in and verified
- [ ] Links tested and tracking enabled
- [ ] Captions customized per platform
- [ ] Hashtags optimized per platform

### During Deployment
- [ ] Monitor first post for issues
- [ ] Check link functionality
- [ ] Verify product tags (TikTok)
- [ ] Confirm shoppable links active

### Post-Deployment
- [ ] Track metrics every 2 hours
- [ ] Engage with comments
- [ ] Note top performers
- [ ] Document any issues
- [ ] Calculate ROI at 24h, 48h, 7d

## Scaling Guidelines

### If Content Performs Well (>10% engagement):
1. Create 3 more hook variations
2. Deploy to additional accounts
3. Increase posting frequency
4. Test on additional platforms

### If Content Underperforms (<3% engagement):
1. Test different hooks
2. Change posting times
3. Adjust caption style
4. Review video quality

## Traffic Flow

\`\`\`
Instagram → Bio Link → Amazon/TikTok Shop
    ↓
YouTube → Description → Amazon/TikTok Shop
    ↓
Facebook → Shop Button → Direct Purchase
    ↓
TikTok → Product Tag → TikTok Shop → Purchase
    ↓
Pinterest → Pin Link → Amazon/Product Page
\`\`\`

All traffic consolidated to maximize:
1. TikTok Shop GMV (primary)
2. Amazon sales (secondary)
3. Email/SMS capture (tertiary)
`;
}

export default {
  PLATFORM_CONFIGS,
  generateHookVariations,
  generateCaptionVariation,
  generatePlatformHashtags,
  createSwarmCampaign,
  calculateDeploymentSchedule,
  generateLinkStrategy,
  calculateSwarmMetrics,
  generateSwarmDeploymentPrompt,
};
