#!/usr/bin/env node

import { Command } from 'commander';
import { CampaignInputSchema } from './types.js';
import { generateMasterPrompt, runPipeline } from './index.js';

const program = new Command();

program
  .name('ad-creative')
  .description('Ad Creative Automation Pipeline - Generate ad creatives using AI')
  .version('0.1.0');

program
  .command('generate')
  .description('Generate the master prompt for ad creative automation')
  .option('-b, --brand <name>', 'Brand name', 'Your Brand')
  .option('-w, --website <url>', 'Brand website URL')
  .option('-d, --description <text>', 'Brand description')
  .option('-p, --product <name>', 'Product or service name')
  .option('-c, --competitors <names>', 'Comma-separated competitor names')
  .option('-g, --goal <type>', 'Campaign goal: awareness, consideration, conversion')
  .option('--platforms <names>', 'Target platforms: meta, google, tiktok, linkedin')
  .option('-o, --output <file>', 'Output file path')
  .action(async (options) => {
    const campaign = {
      brand: {
        name: options.brand,
        website: options.website,
        description: options.description,
      },
      product: options.product,
      competitors: options.competitors?.split(',').map((c: string) => c.trim()),
      goal: options.goal as 'awareness' | 'consideration' | 'conversion' | undefined,
      platforms: options.platforms?.split(',').map((p: string) => p.trim()),
    };

    const prompt = generateMasterPrompt(campaign);

    if (options.output) {
      const fs = await import('fs');
      fs.writeFileSync(options.output, prompt);
      console.log(`Prompt written to ${options.output}`);
    } else {
      console.log(prompt);
    }
  });

program
  .command('research')
  .description('Generate only the market research prompt')
  .option('-b, --brand <name>', 'Brand name', 'Your Brand')
  .option('-w, --website <url>', 'Brand website URL')
  .option('-c, --competitors <names>', 'Comma-separated competitor names')
  .action(async (options) => {
    const { generateResearchPrompt } = await import('./research/market-research.js');

    const campaign = {
      brand: {
        name: options.brand,
        website: options.website,
      },
      competitors: options.competitors?.split(',').map((c: string) => c.trim()),
    };

    console.log(generateResearchPrompt(campaign));
  });

program
  .command('analyze')
  .description('Generate the brand analysis prompt')
  .option('-b, --brand <name>', 'Brand name', 'Your Brand')
  .option('-w, --website <url>', 'Brand website URL')
  .option('-d, --description <text>', 'Brand description')
  .option('-t, --tone <tone>', 'Brand tone of voice')
  .option('--colors <colors>', 'Brand colors (comma-separated)')
  .action(async (options) => {
    const { generateBrandAnalysisPrompt } = await import('./brand/brand-analysis.js');

    const campaign = {
      brand: {
        name: options.brand,
        website: options.website,
        description: options.description,
        tone: options.tone,
        colors: options.colors?.split(',').map((c: string) => c.trim()),
      },
    };

    const research = { competitors: [], industryTrends: [] };
    console.log(generateBrandAnalysisPrompt(campaign, research));
  });

program
  .command('interactive')
  .description('Run interactive mode with prompts for all inputs')
  .action(async () => {
    console.log('Interactive mode coming soon!');
    console.log('For now, use the generate command with options.');
  });

program.parse();
