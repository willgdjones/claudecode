import type { CampaignInput, AdCreativeOutput } from './types.js';

// Module imports
import { conductMarketResearch, generateResearchPrompt } from './research/market-research.js';
import { conductKeywordResearch, generateKeywordPrompt } from './keywords/keyword-research.js';
import { analyzeBrand, generateBrandAnalysisPrompt } from './brand/brand-analysis.js';
import { developCustomerAvatars, generateAvatarPrompt } from './creative/customer-avatars.js';
import { generateHeadlines, generateVisualConcepts, generateHeadlinePrompt } from './creative/headline-generator.js';
import { generateStaticAds, generateUGCVideoAds, generateAdOutputPrompt } from './output/ad-generator.js';

/**
 * Ad Creative Automation Pipeline
 *
 * Orchestrates the full workflow:
 * 1. Market research with SimilarWeb integration
 * 2. Niche keyword discovery
 * 3. Brand deep dive
 * 4. Customer avatar development
 * 5. Headlines and visuals formulation
 * 6. Final ad output generation
 */

export interface PipelineConfig {
  mode: 'full' | 'prompts-only' | 'research-only';
  verbose: boolean;
}

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  mode: 'prompts-only',
  verbose: true,
};

/**
 * Generate all prompts for the pipeline
 * This is the primary mode for Claude Code integration
 */
export function generateAllPrompts(campaign: CampaignInput): string[] {
  const prompts: string[] = [];

  // Step 1: Research prompt
  prompts.push(generateResearchPrompt(campaign));

  // Note: Steps 2-5 need outputs from previous steps
  // In prompt-only mode, we generate template prompts
  // that reference previous outputs

  return prompts;
}

/**
 * Generate a master prompt that chains all steps
 */
export function generateMasterPrompt(campaign: CampaignInput): string {
  const brand = campaign.brand;

  return `
# Complete Ad Creative Automation for ${brand.name}

## Overview
Execute all 5 steps of the ad creative pipeline in sequence.
Each step builds on the previous step's output.

## Campaign Brief
- Brand: ${brand.name}
- Website: ${brand.website || 'Not provided'}
- Description: ${brand.description || 'Not provided'}
- Product: ${campaign.product || 'Main product/service'}
- Goal: ${campaign.goal || 'Not specified'}
- Competitors: ${campaign.competitors?.join(', ') || 'Discover automatically'}
- Platforms: ${campaign.platforms?.join(', ') || 'Meta, Google'}

---

## STEP 1: Market Research

${generateResearchPrompt(campaign)}

---

## STEP 2: Keyword Discovery

After completing research, find niche keywords using these guidelines:

**Focus Areas:**
- Extremely niche search terms competitors miss
- Long-tail keywords with purchase intent
- Question-based queries indicating pain points
- Keyword gaps in the market

**Output:** 20 primary keywords, 50 long-tail keywords, 10 question keywords, keyword gaps

---

## STEP 3: Brand Deep Dive

Analyze ${brand.name}'s brand identity:

**Analyze:**
- Market positioning vs competitors
- Unique value proposition
- Tone of voice (from website/social)
- Visual identity elements
- Messaging pillars
- Brand don'ts

**Output:** Comprehensive brand guide for creative development

---

## STEP 4: Customer Avatars & Headlines

**4a. Develop 2-3 Customer Avatars:**
- Based on research and keyword insights
- Include demographics, psychographics, behaviors
- Define messaging angle for each

**4b. Generate Headlines & Visuals:**
- 15-20 headlines using various frameworks
- 5-7 visual concepts
- Matched to avatars

---

## STEP 5: Final Ad Output

Generate production-ready specifications:

**Static Ads (3 variations):**
1. Problem/pain-focused
2. Benefit/transformation-focused
3. Social proof-focused

Each includes: headline, body, CTA, visual spec, platform specs

**UGC Video Ads (2 scripts):**
1. Testimonial/story style
2. Educational/problem-solution style

Each includes: hook, full script, creator brief, production notes

---

## Final Output Format

Compile everything into a structured JSON output matching the AdCreativeOutput interface.

Include:
- All research findings
- Complete keyword data
- Brand analysis
- Customer avatars
- All static ad specs
- All UGC video scripts with creator briefs
`;
}

/**
 * Run the full pipeline (requires API integrations)
 */
export async function runPipeline(
  campaign: CampaignInput,
  config: Partial<PipelineConfig> = {}
): Promise<AdCreativeOutput> {
  const finalConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config };

  if (finalConfig.verbose) {
    console.log(`Starting ad creative pipeline for ${campaign.brand.name}...`);
  }

  // Step 1: Market Research
  if (finalConfig.verbose) console.log('Step 1: Conducting market research...');
  const research = await conductMarketResearch(campaign);

  // Step 2: Keyword Research
  if (finalConfig.verbose) console.log('Step 2: Discovering niche keywords...');
  const keywords = await conductKeywordResearch(campaign, research);

  // Step 3: Brand Analysis
  if (finalConfig.verbose) console.log('Step 3: Analyzing brand...');
  const brandAnalysis = await analyzeBrand(campaign, research);

  // Step 4a: Customer Avatars
  if (finalConfig.verbose) console.log('Step 4a: Developing customer avatars...');
  const avatars = await developCustomerAvatars(campaign, research, keywords, brandAnalysis);

  // Step 4b: Headlines and Visuals
  if (finalConfig.verbose) console.log('Step 4b: Generating headlines and visuals...');
  const headlines = await Promise.all(
    avatars.map(avatar => generateHeadlines(avatar, brandAnalysis, keywords))
  ).then(results => results.flat());

  const visuals = await Promise.all(
    avatars.map(avatar => generateVisualConcepts(headlines, brandAnalysis, avatar))
  ).then(results => results.flat());

  // Step 5: Generate Ads
  if (finalConfig.verbose) console.log('Step 5: Generating ad variations...');
  const adConfig = {
    staticAdCount: 3,
    ugcVideoCount: 2,
    platforms: campaign.platforms?.map(p => p) || ['meta-feed'],
    includeCreatorBrief: true,
  };

  const staticAds = await generateStaticAds(headlines, visuals, brandAnalysis, avatars, adConfig);
  const ugcVideoAds = await generateUGCVideoAds(avatars, brandAnalysis, headlines, adConfig);

  return {
    campaign,
    research,
    keywords,
    brandAnalysis,
    avatars,
    staticAds,
    ugcVideoAds,
    generatedAt: new Date().toISOString(),
  };
}

// Re-export types and modules
export * from './types.js';
export { generateResearchPrompt } from './research/market-research.js';
export { generateKeywordPrompt } from './keywords/keyword-research.js';
export { generateBrandAnalysisPrompt } from './brand/brand-analysis.js';
export { generateAvatarPrompt } from './creative/customer-avatars.js';
export { generateHeadlinePrompt } from './creative/headline-generator.js';
export { generateAdOutputPrompt } from './output/ad-generator.js';
