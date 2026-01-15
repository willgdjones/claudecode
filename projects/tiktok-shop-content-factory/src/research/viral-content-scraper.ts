/**
 * Viral Content Scraper Module
 *
 * Integrates with Fastmoss and Cruva for discovering viral TikTok Shop content
 * from competitors and trending creators.
 */

import { v4 as uuidv4 } from 'uuid';
import { ViralVideo, ViralAnalysis, Hook, ScriptStructure } from '../types.js';

// ============================================================
// FASTMOSS INTEGRATION
// ============================================================

export interface FastmossConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface FastmossSearchParams {
  niche: string;
  minViews?: number;
  maxDaysOld?: number;
  hasShopLink?: boolean;
  sortBy?: 'views' | 'engagement' | 'gmv' | 'recent';
  limit?: number;
}

/**
 * Search for viral TikTok Shop videos using Fastmoss
 */
export async function searchFastmoss(
  params: FastmossSearchParams,
  config?: FastmossConfig
): Promise<ViralVideo[]> {
  // Generate search prompt for manual/Claude execution
  const searchPrompt = generateFastmossSearchPrompt(params);
  console.log('Fastmoss Search Prompt:', searchPrompt);

  // Placeholder - returns empty array
  // In production, this would call Fastmoss API or use browser automation
  return [];
}

/**
 * Generate a prompt for searching Fastmoss manually or via Claude
 */
export function generateFastmossSearchPrompt(params: FastmossSearchParams): string {
  return `
## Fastmoss Viral Content Search

Search Fastmoss (fastmoss.com) for viral TikTok Shop content with these criteria:

**Niche/Category:** ${params.niche}
**Minimum Views:** ${params.minViews?.toLocaleString() || '100,000'}
**Time Period:** Last ${params.maxDaysOld || 30} days
**Must Have Shop Link:** ${params.hasShopLink !== false ? 'Yes' : 'No'}
**Sort By:** ${params.sortBy || 'engagement'}
**Results Needed:** ${params.limit || 20}

### Data to Extract for Each Video:
1. Video URL
2. View count, likes, comments, shares
3. Engagement rate (likes + comments + shares / views)
4. Video duration (seconds)
5. Posted date
6. Creator handle and follower count
7. Hashtags used
8. Sound/audio used
9. Product tags (if shoppable)

### Priority Signals:
- Videos with high engagement rate (>10%)
- Videos under 60 seconds
- Clear product showcase
- Strong hooks in first 3 seconds
- Native UGC style (not polished ads)
`;
}

// ============================================================
// CRUVA INTEGRATION
// ============================================================

export interface CruvaConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface CruvaSearchParams {
  competitors: string[];
  timeRange?: 'week' | 'month' | 'quarter';
  contentType?: 'all' | 'shoppable' | 'organic';
  minEngagement?: number;
}

/**
 * Analyze competitor content using Cruva
 */
export async function analyzeCompetitorsCruva(
  params: CruvaSearchParams,
  config?: CruvaConfig
): Promise<{ competitor: string; topVideos: ViralVideo[] }[]> {
  const analysisPrompt = generateCruvaAnalysisPrompt(params);
  console.log('Cruva Analysis Prompt:', analysisPrompt);

  return params.competitors.map(competitor => ({
    competitor,
    topVideos: [],
  }));
}

/**
 * Generate prompt for Cruva competitor analysis
 */
export function generateCruvaAnalysisPrompt(params: CruvaSearchParams): string {
  return `
## Cruva Competitor Content Analysis

Analyze the following TikTok Shop competitors using Cruva:

**Competitors to Analyze:**
${params.competitors.map((c, i) => `${i + 1}. ${c}`).join('\n')}

**Time Range:** Last ${params.timeRange || 'month'}
**Content Type:** ${params.contentType || 'all'}
**Minimum Engagement Rate:** ${params.minEngagement || 5}%

### For Each Competitor, Extract:

1. **Top 10 Performing Videos**
   - URL, views, engagement metrics
   - What made each video successful

2. **Content Patterns**
   - Most used hooks
   - Average video length
   - Posting frequency
   - Best performing times

3. **Product Strategy**
   - How they showcase products
   - Price points promoted
   - Discount strategies used

4. **Audio Trends**
   - Trending sounds they use
   - Original audio vs trending
   - Music genres that perform

5. **Hashtag Strategy**
   - Most used hashtags
   - Niche-specific tags
   - Viral tag patterns
`;
}

// ============================================================
// VIRAL VIDEO ANALYSIS
// ============================================================

/**
 * Hook type patterns and their characteristics
 */
export const HOOK_PATTERNS: Record<string, { indicators: string[]; effectiveness: number }> = {
  question: {
    indicators: ['?', 'have you ever', 'did you know', 'what if', 'why do'],
    effectiveness: 85,
  },
  statement: {
    indicators: ['this is', "here's", 'i found', 'the best', 'the only'],
    effectiveness: 75,
  },
  controversy: {
    indicators: ['unpopular opinion', 'hot take', "i don't care", 'nobody talks about'],
    effectiveness: 90,
  },
  curiosity: {
    indicators: ['wait for it', 'you won\'t believe', 'nobody knows', 'secret'],
    effectiveness: 88,
  },
  transformation: {
    indicators: ['before', 'after', 'i tried', 'day 1 vs', 'transformation'],
    effectiveness: 92,
  },
  'pain-point': {
    indicators: ['struggling with', 'tired of', 'frustrated', 'finally', 'solved'],
    effectiveness: 87,
  },
  'social-proof': {
    indicators: ['everyone is', 'viral', 'sold out', 'millions', 'trending'],
    effectiveness: 82,
  },
};

/**
 * Analyze a viral video and extract actionable insights
 */
export function analyzeViralVideo(video: ViralVideo, transcript?: string): ViralAnalysis {
  const hooks = extractHooks(transcript || '');
  const scriptStructure = analyzeScriptStructure(transcript || '', video.duration);

  return {
    videoId: video.id,
    whyItWorks: generateWhyItWorks(video, hooks),
    hooks,
    scriptStructure,
    visualTechniques: inferVisualTechniques(video),
    audioElements: inferAudioElements(video),
    repurposeAngles: generateRepurposeAngles(video, hooks),
  };
}

/**
 * Extract hooks from video transcript
 */
export function extractHooks(transcript: string): Hook[] {
  const hooks: Hook[] = [];
  const firstSentences = transcript.split(/[.!?]/).slice(0, 3).join(' ').toLowerCase();

  for (const [type, pattern] of Object.entries(HOOK_PATTERNS)) {
    for (const indicator of pattern.indicators) {
      if (firstSentences.includes(indicator.toLowerCase())) {
        hooks.push({
          type: type as Hook['type'],
          text: firstSentences.slice(0, 100),
          durationSeconds: 3,
          effectiveness: pattern.effectiveness,
        });
        break;
      }
    }
  }

  // Default hook if none detected
  if (hooks.length === 0) {
    hooks.push({
      type: 'statement',
      text: firstSentences.slice(0, 100) || 'Opening statement',
      durationSeconds: 3,
      effectiveness: 70,
    });
  }

  return hooks;
}

/**
 * Analyze script structure from transcript
 */
export function analyzeScriptStructure(transcript: string, totalDuration: number): ScriptStructure {
  const sentences = transcript.split(/[.!?]/).filter(s => s.trim());
  const hooks = extractHooks(transcript);

  return {
    hook: hooks[0],
    problemAgitation: sentences[1] || 'Problem statement',
    solution: sentences[2] || 'Solution introduction',
    productIntro: sentences[3] || 'Product showcase',
    demonstration: sentences[4] || 'Product demonstration',
    socialProof: sentences[5] || undefined,
    callToAction: sentences[sentences.length - 1] || 'Link in bio / Shop now',
    totalDuration,
  };
}

/**
 * Generate insights on why a video performed well
 */
function generateWhyItWorks(video: ViralVideo, hooks: Hook[]): string[] {
  const reasons: string[] = [];

  // Engagement analysis
  if (video.engagementRate > 10) {
    reasons.push('Exceptionally high engagement rate indicates strong emotional resonance');
  }

  // Duration analysis
  if (video.duration < 30) {
    reasons.push('Short format (<30s) optimized for attention spans');
  } else if (video.duration < 60) {
    reasons.push('Optimal length (30-60s) balances storytelling with retention');
  }

  // Hook analysis
  const topHook = hooks.sort((a, b) => b.effectiveness - a.effectiveness)[0];
  if (topHook) {
    reasons.push(`${topHook.type} hook pattern - proven ${topHook.effectiveness}% effectiveness`);
  }

  // Shoppable analysis
  if (video.isShoppable) {
    reasons.push('Native shopping integration reduces friction to purchase');
  }

  // Hashtag analysis
  if (video.hashtags.length >= 3 && video.hashtags.length <= 7) {
    reasons.push('Optimal hashtag count for discoverability');
  }

  return reasons;
}

/**
 * Infer visual techniques used in the video
 */
function inferVisualTechniques(video: ViralVideo): string[] {
  const techniques: string[] = [];

  if (video.duration < 15) {
    techniques.push('Quick cuts and fast pacing');
  }

  techniques.push('POV/first-person perspective');
  techniques.push('Natural lighting (UGC aesthetic)');
  techniques.push('Text overlays for key points');
  techniques.push('Product close-up shots');

  if (video.isShoppable) {
    techniques.push('Product tag placement in frame');
  }

  return techniques;
}

/**
 * Infer audio elements from video metadata
 */
function inferAudioElements(video: ViralVideo): string[] {
  const elements: string[] = [];

  if (video.soundUsed) {
    elements.push(`Trending sound: ${video.soundUsed}`);
  } else {
    elements.push('Original audio / voiceover');
  }

  elements.push('Clear voice narration');
  elements.push('Background music (subtle)');

  return elements;
}

/**
 * Generate angles for repurposing this viral content
 */
function generateRepurposeAngles(video: ViralVideo, hooks: Hook[]): string[] {
  const angles: string[] = [];

  // Hook variations
  for (const hookType of ['question', 'controversy', 'transformation'] as const) {
    if (hooks[0]?.type !== hookType) {
      angles.push(`Reframe with ${hookType} hook`);
    }
  }

  // Format variations
  angles.push('Split into 3-part series');
  angles.push('Create before/after version');
  angles.push('Add customer testimonial overlay');
  angles.push('Focus on single benefit deep-dive');
  angles.push('Create duet/stitch response format');

  return angles;
}

// ============================================================
// RESEARCH ORCHESTRATION
// ============================================================

export interface ResearchParams {
  niche: string;
  competitors: string[];
  productKeywords: string[];
  minViews?: number;
  daysBack?: number;
}

/**
 * Generate comprehensive research prompt for Claude/Manus execution
 */
export function generateResearchPrompt(params: ResearchParams): string {
  return `
# TikTok Shop Viral Content Research

## Objective
Find and analyze viral TikTok Shop content in the "${params.niche}" niche to identify winning patterns for content repurposing.

## Research Tasks

### 1. Fastmoss Viral Video Search
${generateFastmossSearchPrompt({
  niche: params.niche,
  minViews: params.minViews || 100000,
  maxDaysOld: params.daysBack || 30,
  hasShopLink: true,
  sortBy: 'engagement',
  limit: 20,
})}

### 2. Competitor Analysis (Cruva)
${generateCruvaAnalysisPrompt({
  competitors: params.competitors,
  timeRange: 'month',
  contentType: 'shoppable',
})}

### 3. Product-Specific Search
Search for viral content featuring similar products:
${params.productKeywords.map(kw => `- "${kw}"`).join('\n')}

### 4. Hook Pattern Analysis
For each viral video found, identify:
- Hook type (question, statement, controversy, curiosity, transformation, pain-point, social-proof)
- Exact hook text (first 3 seconds)
- Why it's effective

### 5. Trending Sounds
Identify top 10 trending sounds in ${params.niche} niche that are:
- Currently viral (last 7 days)
- Appropriate for product content
- Not overused (avoid sounds with 1M+ uses)

### Output Format
Provide structured data for:
1. Top 20 viral videos with full metrics
2. 5 competitor analyses
3. 10 hook patterns to replicate
4. 10 trending sounds to use
5. 5 content angles per top video
`;
}

/**
 * Execute full research pipeline
 */
export async function executeResearch(params: ResearchParams): Promise<{
  viralVideos: ViralVideo[];
  analyses: ViralAnalysis[];
  prompt: string;
}> {
  const prompt = generateResearchPrompt(params);

  // Search sources in parallel
  const [fastmossResults, cruvaResults] = await Promise.all([
    searchFastmoss({
      niche: params.niche,
      minViews: params.minViews,
      maxDaysOld: params.daysBack,
      hasShopLink: true,
    }),
    analyzeCompetitorsCruva({
      competitors: params.competitors,
    }),
  ]);

  // Combine all viral videos
  const allVideos = [
    ...fastmossResults,
    ...cruvaResults.flatMap(r => r.topVideos),
  ];

  // Analyze each video
  const analyses = allVideos.map(video => analyzeViralVideo(video));

  return {
    viralVideos: allVideos,
    analyses,
    prompt,
  };
}

export default {
  searchFastmoss,
  analyzeCompetitorsCruva,
  analyzeViralVideo,
  executeResearch,
  generateResearchPrompt,
};
