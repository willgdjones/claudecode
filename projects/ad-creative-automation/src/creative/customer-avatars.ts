import type {
  CampaignInput,
  MarketResearch,
  BrandAnalysis,
  NicheKeywords,
  CustomerAvatar,
} from '../types.js';

/**
 * Step 4a: Customer Avatar Development Module
 *
 * This module creates detailed customer personas based on:
 * - Market research findings
 * - Keyword intent analysis
 * - Brand positioning
 * - Competitor customer bases
 */

/**
 * Create avatars from research data
 */
export async function developCustomerAvatars(
  campaign: CampaignInput,
  research: MarketResearch,
  keywords: NicheKeywords,
  brandAnalysis: BrandAnalysis
): Promise<CustomerAvatar[]> {
  // Would use AI to synthesize research into distinct personas
  return [];
}

/**
 * Generate avatar development prompt for Claude
 */
export function generateAvatarPrompt(
  campaign: CampaignInput,
  research: MarketResearch,
  keywords: NicheKeywords,
  brandAnalysis: BrandAnalysis
): string {
  const brand = campaign.brand;
  const topKeywords = [
    ...keywords.primary.slice(0, 10),
    ...keywords.longTail.slice(0, 10),
  ].map(k => k.keyword).join(', ');
  const questions = keywords.questions.slice(0, 10).join('\n- ');
  const painPoints = keywords.gaps.slice(0, 5).join(', ');

  return `
# Customer Avatar Development for ${brand.name}

## Objective
Create 2-3 detailed customer avatars that will drive ad creative development.
These should be based on REAL data, not assumptions.

## Research Inputs

### Keywords People Search
${topKeywords}

### Questions They Ask
- ${questions || 'None identified'}

### Pain Points Indicated
${painPoints || 'Derive from keywords'}

### Brand Positioning
${brandAnalysis.positioning || 'To be determined'}

### Target Audience (stated)
${brand.targetAudience || 'Not specified'}

## Avatar Requirements

For each avatar (create 2-3), provide:

### Demographics
- Name (realistic persona name)
- Age range
- Gender (if relevant)
- Location/region
- Income level
- Education level
- Occupation

### Psychographics
- Core values (what matters to them)
- Interests and hobbies
- Pain points (specific, emotional)
- Goals (what they're trying to achieve)
- Fears (what keeps them up at night)

### Behaviors
- Where they consume content (platforms, media)
- What drives their purchase decisions
- Common objections they have
- How they research solutions
- Triggers that move them to action

### Messaging Angle
For each avatar, define:
- The primary hook that resonates with them
- Emotional trigger to emphasize
- Proof they need to see
- Best ad format for reaching them

## Avatar Types to Consider

1. **Primary Buyer** - The main customer who makes the purchase
2. **Aspirational Buyer** - Someone who wants the transformation
3. **Problem-Aware Buyer** - Someone actively seeking solutions
4. **Unaware Buyer** - Someone who doesn't know the solution exists

## Output Format
Create detailed profiles that creative teams can reference when writing copy.
Each avatar should feel like a real person, not a demographic.
`.trim();
}
