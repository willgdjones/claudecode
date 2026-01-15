import type { CampaignInput, MarketResearch, NicheKeywords, KeywordData } from '../types.js';

/**
 * Step 2: Niche Keyword Discovery Module
 *
 * This module finds extremely niche search terms that:
 * - Have lower competition
 * - Show high purchase intent
 * - Reveal underserved audience segments
 * - Uncover content gaps competitors miss
 */

export interface KeywordConfig {
  maxPrimaryKeywords: number;
  maxLongTailKeywords: number;
  minSearchVolume: number;
  maxDifficulty: number;
}

const DEFAULT_CONFIG: KeywordConfig = {
  maxPrimaryKeywords: 20,
  maxLongTailKeywords: 50,
  minSearchVolume: 10,
  maxDifficulty: 70,
};

/**
 * Classify keyword intent based on the search term
 */
export function classifyIntent(keyword: string): KeywordData['intent'] {
  const transactionalSignals = ['buy', 'price', 'cost', 'cheap', 'deal', 'discount', 'order', 'purchase'];
  const commercialSignals = ['best', 'top', 'review', 'compare', 'vs', 'alternative'];
  const navigationalSignals = ['login', 'sign in', 'website', 'app', 'download'];

  const lower = keyword.toLowerCase();

  if (transactionalSignals.some(s => lower.includes(s))) return 'transactional';
  if (commercialSignals.some(s => lower.includes(s))) return 'commercial';
  if (navigationalSignals.some(s => lower.includes(s))) return 'navigational';
  return 'informational';
}

/**
 * Find keyword gaps - terms competitors don't target
 */
export function findKeywordGaps(
  allKeywords: string[],
  competitorKeywords: string[][]
): string[] {
  const competitorSet = new Set(competitorKeywords.flat().map(k => k.toLowerCase()));
  return allKeywords.filter(k => !competitorSet.has(k.toLowerCase()));
}

/**
 * Generate question-based keywords from seed terms
 */
export function generateQuestionKeywords(seedKeywords: string[]): string[] {
  const questionStarters = [
    'how to',
    'what is',
    'why does',
    'when should',
    'where can',
    'which',
    'can you',
    'is it',
    'does',
  ];

  const questions: string[] = [];
  for (const keyword of seedKeywords.slice(0, 5)) {
    for (const starter of questionStarters) {
      questions.push(`${starter} ${keyword}`);
    }
  }
  return questions;
}

/**
 * Main keyword research function
 */
export async function conductKeywordResearch(
  campaign: CampaignInput,
  research: MarketResearch,
  config: Partial<KeywordConfig> = {}
): Promise<NicheKeywords> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Extract competitor keywords for gap analysis
  const competitorKeywords = research.competitors
    .map(c => c.topKeywords || [])
    .filter(k => k.length > 0);

  return {
    primary: [],
    longTail: [],
    questions: [],
    relatedTopics: [],
    gaps: [],
  };
}

/**
 * Generate a keyword research prompt for Claude to execute
 */
export function generateKeywordPrompt(
  campaign: CampaignInput,
  research: MarketResearch
): string {
  const brandName = campaign.brand.name;
  const product = campaign.product || 'main product/service';
  const competitorKeywords = research.competitors
    .flatMap(c => c.topKeywords || [])
    .slice(0, 20)
    .join(', ');

  return `
# Niche Keyword Discovery for ${brandName}

## Objective
Find extremely niche, high-intent search terms that competitors are missing.

## Context
- Brand: ${brandName}
- Product/Service: ${product}
- Known competitor keywords: ${competitorKeywords || 'None identified yet'}

## Research Tasks

### 1. Primary Keywords (10-20)
Find main keywords with:
- Commercial or transactional intent
- Reasonable search volume (100-10k/month)
- Moderate competition

### 2. Long-Tail Niche Keywords (30-50)
Discover highly specific phrases:
- 4+ words
- Very specific pain points
- Low competition (competitors aren't bidding)
- "Hidden gem" search terms
- Industry jargon customers actually use

### 3. Question Keywords
Find questions people ask about:
- Problems the product solves
- Comparisons and alternatives
- How-to queries related to the space
- Concerns and objections

### 4. Keyword Gaps
Identify terms where:
- Competitors have weak content
- No one is running ads
- High intent but underserved

### 5. Related Topics
Discover adjacent topics that indicate:
- Buying readiness
- Problem awareness
- Solution seeking behavior

## Output Format
For each keyword include:
- The keyword itself
- Estimated search volume (if available)
- Intent classification (informational/commercial/transactional)
- Why it's valuable for ads

Focus on NICHE terms that would be missed by basic keyword tools.
`.trim();
}
