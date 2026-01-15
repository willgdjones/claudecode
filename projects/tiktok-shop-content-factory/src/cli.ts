#!/usr/bin/env node
/**
 * TikTok Shop Content Factory CLI
 *
 * Command-line interface for the AI content factory system.
 */

import { Command } from 'commander';
import { CampaignInput, Product } from './types.js';
import {
  generateAllPrompts,
  runFullPipeline,
  DEFAULT_PIPELINE_CONFIG,
  PipelineConfig,
} from './index.js';
import {
  generateResearchPrompt,
  generateManusResearchPrompt,
} from './research/index.js';
import {
  generateScriptCreationPrompt,
  generateContentBriefs,
} from './content/index.js';
import {
  generateBatchProfiles,
  generateAccountSetupPrompt,
} from './accounts/index.js';
import {
  generatePhoneNetworkSetupPrompt,
} from './posting/index.js';

const program = new Command();

program
  .name('content-factory')
  .description('TikTok Shop AI Content Factory - Generate viral content at scale')
  .version('1.0.0');

// ============================================================
// GENERATE COMMAND - Full Pipeline Prompts
// ============================================================

program
  .command('generate')
  .description('Generate master prompt for full content factory pipeline')
  .requiredOption('-p, --product <name>', 'Product name')
  .requiredOption('-c, --category <category>', 'Product category')
  .option('-n, --niche <niche>', 'Target niche', 'general')
  .option('--competitors <list>', 'Comma-separated competitor list', '')
  .option('--benefits <list>', 'Comma-separated key benefits', '')
  .option('--price <price>', 'Product price', '29.99')
  .option('--shop-url <url>', 'TikTok Shop URL')
  .option('--amazon-url <url>', 'Amazon product URL')
  .option('--platforms <list>', 'Target platforms', 'tiktok,instagram')
  .option('--scripts <count>', 'Number of scripts to generate', '10')
  .option('--accounts <count>', 'Number of accounts to create', '5')
  .option('--video-tool <tool>', 'Video generation tool (kling/veo3)', 'kling')
  .option('--mode <mode>', 'Pipeline mode (full/prompts-only)', 'prompts-only')
  .action((options) => {
    const product: Partial<Product> = {
      name: options.product,
      category: options.category,
      price: parseFloat(options.price),
      keyBenefits: options.benefits ? options.benefits.split(',') : [],
      targetDemographic: options.niche,
      tiktokShopUrl: options.shopUrl,
      amazonUrl: options.amazonUrl,
      images: [],
      description: `${options.product} - ${options.category}`,
    };

    const campaign: CampaignInput = {
      product: product as Product,
      niche: options.niche,
      competitors: options.competitors ? options.competitors.split(',') : [],
      dailyPostTarget: 3,
      platforms: options.platforms.split(',') as any[],
      contentStyle: 'mixed',
    };

    const config: PipelineConfig = {
      ...DEFAULT_PIPELINE_CONFIG,
      mode: options.mode as PipelineConfig['mode'],
      videoTool: options.videoTool as PipelineConfig['videoTool'],
      scriptsToGenerate: parseInt(options.scripts),
      accountsToCreate: parseInt(options.accounts),
    };

    const masterPrompt = generateAllPrompts(campaign, config);
    console.log(masterPrompt);
  });

// ============================================================
// RESEARCH COMMAND - Research Phase Only
// ============================================================

program
  .command('research')
  .description('Generate research prompts for viral content discovery')
  .requiredOption('-n, --niche <niche>', 'Target niche')
  .option('--competitors <list>', 'Comma-separated competitor list', '')
  .option('--keywords <list>', 'Product-related keywords', '')
  .option('--min-views <count>', 'Minimum view count', '100000')
  .option('--days <count>', 'Days to look back', '30')
  .action((options) => {
    const prompt = generateResearchPrompt({
      niche: options.niche,
      competitors: options.competitors ? options.competitors.split(',') : [],
      productKeywords: options.keywords ? options.keywords.split(',') : [options.niche],
      minViews: parseInt(options.minViews),
      daysBack: parseInt(options.days),
    });

    console.log(prompt);
  });

// ============================================================
// PRODUCT COMMAND - Product Research
// ============================================================

program
  .command('product')
  .description('Generate product research prompt for Manus AI')
  .requiredOption('-p, --product <name>', 'Product name')
  .requiredOption('-c, --category <category>', 'Product category')
  .option('--url <url>', 'Product URL')
  .option('--market <target>', 'Target market', 'general consumer')
  .action((options) => {
    const prompt = generateManusResearchPrompt({
      productName: options.product,
      category: options.category,
      productUrl: options.url,
      targetMarket: options.market,
    });

    console.log(prompt);
  });

// ============================================================
// SCRIPTS COMMAND - Script Generation
// ============================================================

program
  .command('scripts')
  .description('Generate script creation prompts')
  .requiredOption('-p, --product <name>', 'Product name')
  .requiredOption('-c, --category <category>', 'Product category')
  .option('--benefits <list>', 'Key benefits (comma-separated)', '')
  .option('--audience <target>', 'Target audience')
  .option('--count <number>', 'Number of scripts', '10')
  .action((options) => {
    const product: Partial<Product> = {
      name: options.product,
      category: options.category,
      keyBenefits: options.benefits ? options.benefits.split(',') : [],
      targetDemographic: options.audience || 'general consumer',
    };

    const prompt = generateScriptCreationPrompt(
      product,
      [], // Would include viral analyses in full mode
      parseInt(options.count)
    );

    console.log(prompt);
  });

// ============================================================
// ACCOUNTS COMMAND - Account Setup
// ============================================================

program
  .command('accounts')
  .description('Generate account setup instructions')
  .requiredOption('-n, --niche <niche>', 'Target niche')
  .requiredOption('-t, --type <productType>', 'Product type')
  .option('--count <number>', 'Number of accounts', '5')
  .option('--platform <platform>', 'Platform (tiktok/instagram/youtube)', 'tiktok')
  .action((options) => {
    const profiles = generateBatchProfiles({
      count: parseInt(options.count),
      niche: options.niche,
      productType: options.type,
      platform: options.platform as 'tiktok' | 'instagram' | 'youtube',
    });

    const prompt = generateAccountSetupPrompt(profiles);
    console.log(prompt);

    console.log('\n' + '='.repeat(80) + '\n');

    // Also generate phone network setup
    const phonePrompt = generatePhoneNetworkSetupPrompt(
      parseInt(options.count),
      3 // default posts per day
    );
    console.log(phonePrompt);
  });

// ============================================================
// BRIEFS COMMAND - Content Brief Generation
// ============================================================

program
  .command('briefs')
  .description('Generate content briefs')
  .requiredOption('-p, --product <name>', 'Product name')
  .requiredOption('-c, --category <category>', 'Product category')
  .option('--count <number>', 'Number of briefs', '5')
  .option('--platforms <list>', 'Target platforms', 'tiktok')
  .action((options) => {
    const product: Partial<Product> = {
      name: options.product,
      category: options.category,
      keyBenefits: [],
      targetDemographic: 'general consumer',
    };

    const briefs = generateContentBriefs({
      product,
      scriptsToGenerate: parseInt(options.count),
      platforms: options.platforms.split(','),
    });

    console.log('# Generated Content Briefs\n');

    for (const brief of briefs) {
      console.log(`## ${brief.title}`);
      console.log(`**Hook:** ${brief.hook.text}`);
      console.log(`**Duration:** ${brief.duration}s`);
      console.log(`**Script:**\n${brief.script}`);
      console.log(`**Visual Direction:**`);
      brief.visualDirection.forEach(v => console.log(`  - ${v}`));
      console.log(`**Sound:** ${brief.soundDirection}`);
      console.log(`**CTA:** ${brief.callToAction}`);
      console.log(`**Hashtags:** ${brief.hashtags.join(' ')}`);
      console.log('\n---\n');
    }
  });

// ============================================================
// RUN COMMAND - Full Pipeline Execution
// ============================================================

program
  .command('run')
  .description('Run the full content factory pipeline (requires API integrations)')
  .requiredOption('-p, --product <name>', 'Product name')
  .requiredOption('-c, --category <category>', 'Product category')
  .option('-n, --niche <niche>', 'Target niche', 'general')
  .option('--competitors <list>', 'Competitor list', '')
  .option('--platforms <list>', 'Target platforms', 'tiktok')
  .option('--video-tool <tool>', 'Video tool (kling/veo3)', 'kling')
  .action(async (options) => {
    console.log('Starting full pipeline execution...\n');

    const product: Partial<Product> = {
      id: 'product-1',
      name: options.product,
      category: options.category,
      price: 29.99,
      keyBenefits: [],
      targetDemographic: options.niche,
      images: [],
      description: options.product,
    };

    const campaign: CampaignInput = {
      product: product as Product,
      niche: options.niche,
      competitors: options.competitors ? options.competitors.split(',') : [],
      dailyPostTarget: 3,
      platforms: options.platforms.split(',') as any[],
      contentStyle: 'mixed',
    };

    const config: PipelineConfig = {
      ...DEFAULT_PIPELINE_CONFIG,
      mode: 'full',
      videoTool: options.videoTool as PipelineConfig['videoTool'],
    };

    const state = await runFullPipeline(campaign, config);

    console.log('\n=== Pipeline Results ===');
    console.log(`Campaign ID: ${state.campaignId}`);
    console.log(`Final Step: ${state.currentStep}`);
    console.log(`Started: ${state.startedAt}`);
    console.log(`Completed: ${state.updatedAt}`);

    if (state.errors.length > 0) {
      console.log('\nErrors:');
      state.errors.forEach(e => console.log(`  - [${e.step}] ${e.message}`));
    }

    if (state.content) {
      console.log(`\nContent Generated:`);
      console.log(`  - Briefs: ${state.content.briefs.length}`);
      console.log(`  - Images: ${state.content.images.length}`);
      console.log(`  - Videos: ${state.content.videos.length}`);
    }

    if (state.posting) {
      console.log(`\nPosts Scheduled: ${state.posting.scheduledPosts.length}`);
    }

    if (state.swarm) {
      console.log(`\nSwarm Campaign: ${state.swarm.name}`);
      console.log(`  - Variations: ${state.swarm.variations.length}`);
      console.log(`  - Platforms: ${state.swarm.targetPlatforms.join(', ')}`);
    }
  });

// ============================================================
// INTERACTIVE COMMAND
// ============================================================

program
  .command('interactive')
  .description('Launch interactive mode (coming soon)')
  .action(() => {
    console.log('Interactive mode coming soon!');
    console.log('\nFor now, use these commands:');
    console.log('  content-factory generate --help');
    console.log('  content-factory research --help');
    console.log('  content-factory scripts --help');
    console.log('  content-factory accounts --help');
  });

// Parse arguments
program.parse();
