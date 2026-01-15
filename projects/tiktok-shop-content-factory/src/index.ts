/**
 * TikTok Shop Content Factory
 *
 * Main entry point and pipeline orchestration for the AI-powered
 * content factory system.
 */

import { v4 as uuidv4 } from 'uuid';

// Type imports
import {
  CampaignInput,
  Product,
  PipelineState,
  ViralVideo,
  ViralAnalysis,
  ContentBrief,
  GeneratedImage,
  GeneratedVideo,
  CreatorProfile,
  Post,
  SwarmCampaign,
} from './types.js';

// Module imports
import {
  executeResearch,
  generateResearchPrompt,
  generateManusResearchPrompt,
  generateViralScriptIdeas,
} from './research/index.js';

import {
  generateContentBriefs,
  generateHooks,
  generateScriptCreationPrompt,
  generateImageCreationPrompt,
  generateBatchImages,
  SCRIPT_FRAMEWORKS,
} from './content/index.js';

import {
  generateBatchVideos,
  generateVideoCreationPrompt,
} from './video/index.js';

import {
  generateBatchProfiles,
  generateAccountSetupPrompt,
  createProfileManager,
  CREATOR_PERSONAS,
} from './accounts/index.js';

import {
  scheduleBatchPosts,
  generateScheduleOverview,
  generatePhoneNetworkSetupPrompt,
} from './posting/index.js';

import {
  createSwarmCampaign,
  generateSwarmDeploymentPrompt,
  PLATFORM_CONFIGS,
} from './swarm/index.js';

// ============================================================
// PIPELINE ORCHESTRATION
// ============================================================

export interface PipelineConfig {
  mode: 'full' | 'research-only' | 'content-only' | 'prompts-only';
  videoTool: 'kling' | 'veo3';
  scriptsToGenerate: number;
  accountsToCreate: number;
  postsPerDay: number;
  daysToSchedule: number;
  enableSwarm: boolean;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  mode: 'prompts-only',
  videoTool: 'kling',
  scriptsToGenerate: 10,
  accountsToCreate: 5,
  postsPerDay: 3,
  daysToSchedule: 7,
  enableSwarm: true,
};

/**
 * Initialize pipeline state
 */
export function initializePipeline(campaignInput: CampaignInput): PipelineState {
  return {
    campaignId: uuidv4(),
    currentStep: 'research',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    errors: [],
  };
}

/**
 * Generate all prompts for the content factory pipeline
 * This is the primary function for prompt-driven automation
 */
export function generateAllPrompts(
  campaign: CampaignInput,
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG
): string {
  const { product, niche, competitors } = campaign;

  // Generate all prompts for each stage
  const researchPrompt = generateResearchPrompt({
    niche,
    competitors,
    productKeywords: [product.name, product.category, ...product.keyBenefits.slice(0, 3)],
    minViews: 100000,
    daysBack: 30,
  });

  const productResearchPrompt = generateManusResearchPrompt({
    productName: product.name,
    category: product.category,
    productUrl: product.tiktokShopUrl,
    targetMarket: product.targetDemographic,
  });

  // Generate sample content briefs for prompt
  const sampleBriefs = generateContentBriefs({
    product,
    scriptsToGenerate: 3,
    platforms: campaign.platforms,
  });

  const scriptPrompt = generateScriptCreationPrompt(
    product,
    [], // Would be filled with actual analyses
    config.scriptsToGenerate
  );

  const imagePrompt = generateImageCreationPrompt(sampleBriefs, product);

  const videoPrompt = generateVideoCreationPrompt(sampleBriefs, product, config.videoTool);

  // Account setup
  const profiles = generateBatchProfiles({
    count: config.accountsToCreate,
    niche,
    productType: product.category,
    platform: campaign.platforms[0] as 'tiktok' | 'instagram' | 'youtube',
  });

  const accountPrompt = generateAccountSetupPrompt(profiles);
  const phoneNetworkPrompt = generatePhoneNetworkSetupPrompt(
    config.accountsToCreate,
    config.postsPerDay
  );

  // Combine all prompts into master document
  return `
${'='.repeat(80)}
TIKTOK SHOP AI CONTENT FACTORY - MASTER PROMPT
${'='.repeat(80)}

Campaign: ${product.name}
Niche: ${niche}
Generated: ${new Date().toISOString()}
Mode: ${config.mode}

${'='.repeat(80)}

TABLE OF CONTENTS
1. Research Phase
2. Product Analysis
3. Script Generation
4. Image Generation
5. Video Generation
6. Account Setup
7. Posting Schedule
8. Multi-Platform Swarm

${'='.repeat(80)}

PHASE 1: RESEARCH
${'='.repeat(80)}

${researchPrompt}

${'='.repeat(80)}

PHASE 2: PRODUCT ANALYSIS (MANUS AI)
${'='.repeat(80)}

${productResearchPrompt}

${'='.repeat(80)}

PHASE 3: SCRIPT GENERATION
${'='.repeat(80)}

${scriptPrompt}

${'='.repeat(80)}

PHASE 4: IMAGE GENERATION (NANO BANANA)
${'='.repeat(80)}

${imagePrompt}

${'='.repeat(80)}

PHASE 5: VIDEO GENERATION (${config.videoTool.toUpperCase()})
${'='.repeat(80)}

${videoPrompt}

${'='.repeat(80)}

PHASE 6: ACCOUNT SETUP
${'='.repeat(80)}

${accountPrompt}

${'='.repeat(80)}

PHASE 7: PHONE NETWORK SETUP
${'='.repeat(80)}

${phoneNetworkPrompt}

${'='.repeat(80)}

EXECUTION WORKFLOW
${'='.repeat(80)}

## Daily Operations Checklist

### Morning (6:00-8:00 AM)
- [ ] Check all accounts health status
- [ ] Review overnight engagement metrics
- [ ] Clear any flagged content
- [ ] Verify posting queue for the day

### Midday (12:00-1:00 PM)
- [ ] Monitor morning post performance
- [ ] Respond to top comments
- [ ] Adjust afternoon schedule if needed
- [ ] Check trending sounds/topics

### Evening (6:00-8:00 PM)
- [ ] Review full day metrics
- [ ] Prepare next day's content queue
- [ ] Engage with comments on all posts
- [ ] Document top performers

### Weekly Review
- [ ] Calculate total GMV
- [ ] Identify best performing content types
- [ ] Optimize underperforming accounts
- [ ] Plan content calendar for next week
- [ ] Update hook/script variations based on data

${'='.repeat(80)}

TECH STACK SUMMARY
${'='.repeat(80)}

## Research & Intelligence
- **Manus AI** - Autonomous product research
- **Fastmoss** - Viral TikTok content discovery
- **Cruva** - Competitor analysis

## Content Creation
- **Nano Banana Pro** - UGC-style image generation
- **Kling 2.6 / Veo3** - AI video generation

## Distribution
- **Phone Network** - Multi-account posting
- **MPS (Multi-Platform Swarm)** - Cross-platform deployment

## Analytics
- TikTok Shop Analytics
- Platform-native insights
- Custom tracking links

${'='.repeat(80)}

END OF MASTER PROMPT
${'='.repeat(80)}
`;
}

/**
 * Run the full pipeline (requires API integrations)
 */
export async function runFullPipeline(
  campaign: CampaignInput,
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG
): Promise<PipelineState> {
  const state = initializePipeline(campaign);

  try {
    // Step 1: Research
    state.currentStep = 'research';
    state.updatedAt = new Date().toISOString();
    console.log('Starting research phase...');

    const research = await executeResearch({
      niche: campaign.niche,
      competitors: campaign.competitors,
      productKeywords: [campaign.product.name, campaign.product.category],
    });

    state.research = {
      viralVideos: research.viralVideos,
      analyses: research.analyses,
      status: 'completed',
    };

    // Step 2: Content Brief Generation
    state.currentStep = 'brief-generation';
    state.updatedAt = new Date().toISOString();
    console.log('Generating content briefs...');

    const briefs = generateContentBriefs({
      product: campaign.product,
      viralAnalyses: research.analyses,
      scriptsToGenerate: config.scriptsToGenerate,
      platforms: campaign.platforms,
    });

    state.content = {
      briefs,
      images: [],
      videos: [],
      status: 'in-progress',
    };

    // Step 3: Image Generation
    state.currentStep = 'image-generation';
    state.updatedAt = new Date().toISOString();
    console.log('Generating images...');

    const images = await generateBatchImages({
      briefs,
      product: campaign.product,
      imagesPerBrief: 5,
      styles: ['ugc', 'product-shot', 'lifestyle'],
    });

    state.content.images = images;

    // Step 4: Video Generation
    state.currentStep = 'video-generation';
    state.updatedAt = new Date().toISOString();
    console.log('Generating videos...');

    const videos = await generateBatchVideos({
      briefs,
      images,
      product: campaign.product,
      tool: config.videoTool,
    });

    state.content.videos = videos;
    state.content.status = 'completed';

    // Step 5: Account Setup
    state.currentStep = 'account-setup';
    state.updatedAt = new Date().toISOString();
    console.log('Setting up accounts...');

    const profiles = generateBatchProfiles({
      count: config.accountsToCreate,
      niche: campaign.niche,
      productType: campaign.product.category,
      platform: campaign.platforms[0] as 'tiktok' | 'instagram' | 'youtube',
    });

    // Step 6: Scheduling
    state.currentStep = 'scheduling';
    state.updatedAt = new Date().toISOString();
    console.log('Scheduling posts...');

    const posts = scheduleBatchPosts({
      profiles,
      videos,
      product: campaign.product,
      startDate: new Date(),
      daysToSchedule: config.daysToSchedule,
      postsPerDay: config.postsPerDay,
    });

    state.posting = {
      scheduledPosts: posts,
      status: 'completed',
    };

    // Step 7: Swarm Setup (if enabled)
    if (config.enableSwarm && briefs.length > 0 && videos.length > 0) {
      state.currentStep = 'swarm-deployment';
      state.updatedAt = new Date().toISOString();
      console.log('Setting up swarm deployment...');

      const swarmCampaign = createSwarmCampaign({
        contentBrief: briefs[0],
        video: videos[0],
        product: campaign.product,
        targetPlatforms: campaign.platforms,
        accountsPerPlatform: Math.ceil(config.accountsToCreate / campaign.platforms.length),
        variationsPerAccount: 2,
        deploymentStrategy: 'staggered',
      });

      state.swarm = swarmCampaign;
    }

    // Complete
    state.currentStep = 'completed';
    state.updatedAt = new Date().toISOString();
    console.log('Pipeline completed successfully!');

  } catch (error) {
    state.errors.push({
      step: state.currentStep,
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
    console.error('Pipeline error:', error);
  }

  return state;
}

// Export all modules
export * from './types.js';
export * from './research/index.js';
export * from './content/index.js';
export * from './video/index.js';
export * from './accounts/index.js';
export * from './posting/index.js';
export * from './swarm/index.js';

export default {
  initializePipeline,
  generateAllPrompts,
  runFullPipeline,
  DEFAULT_PIPELINE_CONFIG,
};
