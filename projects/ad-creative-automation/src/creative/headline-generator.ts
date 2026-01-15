import type {
  CustomerAvatar,
  BrandAnalysis,
  NicheKeywords,
  Headline,
  VisualConcept,
} from '../types.js';

/**
 * Step 4b: Headlines & Visuals Formulation Module
 *
 * This module generates headlines and visual concepts based on:
 * - Customer avatar insights
 * - Brand guidelines
 * - Keyword research
 * - Proven ad frameworks
 */

export type HeadlineFramework =
  | 'pas'      // Problem-Agitation-Solution
  | 'aida'     // Attention-Interest-Desire-Action
  | 'fab'      // Features-Advantages-Benefits
  | 'before-after'
  | 'social-proof'
  | 'curiosity-gap'
  | 'direct-benefit'
  | 'question'
  | 'how-to'
  | 'news-angle';

export const HEADLINE_FRAMEWORKS: Record<HeadlineFramework, string> = {
  pas: 'Identify problem, agitate it, present solution',
  aida: 'Grab attention, build interest, create desire, prompt action',
  fab: 'State feature, explain advantage, show benefit',
  'before-after': 'Show transformation from current to desired state',
  'social-proof': 'Lead with credibility, testimonial, or numbers',
  'curiosity-gap': 'Create intrigue that demands clicking',
  'direct-benefit': 'Lead with the primary benefit clearly stated',
  question: 'Ask a question that resonates with pain/desire',
  'how-to': 'Promise to teach something valuable',
  'news-angle': 'Frame as new, breaking, or timely',
};

/**
 * Generate headlines for a specific avatar
 */
export async function generateHeadlines(
  avatar: CustomerAvatar,
  brandAnalysis: BrandAnalysis,
  keywords: NicheKeywords
): Promise<Headline[]> {
  // Would use AI to generate headlines using various frameworks
  return [];
}

/**
 * Generate visual concepts for headlines
 */
export async function generateVisualConcepts(
  headlines: Headline[],
  brandAnalysis: BrandAnalysis,
  avatar: CustomerAvatar
): Promise<VisualConcept[]> {
  // Would use AI to create visual direction briefs
  return [];
}

/**
 * Generate headline and visual prompt for Claude
 */
export function generateHeadlinePrompt(
  avatars: CustomerAvatar[],
  brandAnalysis: BrandAnalysis,
  keywords: NicheKeywords
): string {
  const avatarSummaries = avatars.map((a, i) =>
    `${i + 1}. ${a.name}: ${a.psychographics.painPoints.join(', ')}`
  ).join('\n');

  const frameworks = Object.entries(HEADLINE_FRAMEWORKS)
    .map(([key, desc]) => `- **${key}**: ${desc}`)
    .join('\n');

  const topKeywords = [
    ...keywords.primary.slice(0, 5),
    ...keywords.longTail.slice(0, 10),
  ].map(k => k.keyword).join(', ');

  return `
# Headlines & Visual Concepts Development

## Objective
Create compelling headlines and visual concepts for each customer avatar.
Output should be ready for design execution.

## Customer Avatars
${avatarSummaries || 'Use avatars from previous step'}

## Brand Voice
Tone: ${brandAnalysis.toneOfVoice.adjectives.join(', ') || 'To be determined'}
Pillars: ${brandAnalysis.messagingPillars.join(', ') || 'To be determined'}

## Key Terms to Incorporate
${topKeywords}

## Headline Frameworks to Use
${frameworks}

## Requirements

### Headlines (15-20 total)
For each avatar, create 5-7 headlines using different frameworks:

Each headline needs:
- The headline text (keep under 65 characters for Meta)
- Framework used
- Target avatar
- Emotional angle/hook
- Type: benefit / curiosity / social-proof / urgency / question

Ensure variety:
- Mix of long and short
- Different emotional angles
- Various frameworks
- Both problem-focused and solution-focused

### Visual Concepts (5-7 total)
For the best headlines, create visual direction briefs:

Each concept needs:
- Detailed visual description
- Style (photo, illustration, graphic, UGC-style)
- Key elements to include
- Color direction (aligned with brand)
- Mood/reference description
- Platform specifications (story, feed, etc.)

## Winning Headline Patterns
Use these proven patterns:
- Numbers: "5 reasons...", "In just 3 days..."
- Power words: "Finally", "Discover", "Secret", "Free"
- Specificity: Exact results, timeframes, amounts
- Questions that make them think
- Incomplete thoughts that demand completion

## Output Format
Organize by avatar, with headlines grouped by type.
Include rationale for top 5 headlines.
`.trim();
}
