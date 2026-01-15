/**
 * Script Generator Module
 *
 * Generates viral TikTok scripts from analyzed content patterns,
 * customized for specific products and target audiences.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ContentBrief,
  Hook,
  ViralAnalysis,
  Product,
  ScriptStructure,
} from '../types.js';

// ============================================================
// SCRIPT TEMPLATES & FRAMEWORKS
// ============================================================

/**
 * Proven viral script frameworks
 */
export const SCRIPT_FRAMEWORKS = {
  PAS: {
    name: 'Problem-Agitate-Solution',
    structure: ['hook', 'problem', 'agitation', 'solution', 'product', 'cta'],
    description: 'Classic copywriting framework that works well for pain-point products',
    bestFor: ['health', 'productivity', 'pain-relief', 'organization'],
  },
  AIDA: {
    name: 'Attention-Interest-Desire-Action',
    structure: ['attention', 'interest', 'desire', 'action'],
    description: 'Build curiosity and desire before revealing product',
    bestFor: ['luxury', 'lifestyle', 'aspirational', 'tech'],
  },
  BAB: {
    name: 'Before-After-Bridge',
    structure: ['before', 'after', 'bridge'],
    description: 'Show transformation with product as the bridge',
    bestFor: ['fitness', 'beauty', 'self-improvement', 'skills'],
  },
  STORY: {
    name: 'Story Arc',
    structure: ['setup', 'conflict', 'resolution', 'product-reveal', 'cta'],
    description: 'Narrative-driven content that builds emotional connection',
    bestFor: ['personal-care', 'home', 'family', 'pets'],
  },
  DEMO: {
    name: 'Demonstration',
    structure: ['hook', 'show-problem', 'demonstrate-solution', 'results', 'cta'],
    description: 'Show don\'t tell - product demonstration focused',
    bestFor: ['kitchen', 'cleaning', 'tools', 'gadgets'],
  },
  SOCIAL_PROOF: {
    name: 'Social Proof Led',
    structure: ['viral-claim', 'proof', 'personal-experience', 'recommendation', 'cta'],
    description: 'Lead with popularity and social validation',
    bestFor: ['trending', 'viral-products', 'bestsellers', 'new-releases'],
  },
  CURIOSITY: {
    name: 'Curiosity Gap',
    structure: ['mystery-hook', 'build-tension', 'partial-reveal', 'full-reveal', 'cta'],
    description: 'Create information gap that viewers must close',
    bestFor: ['unique-products', 'innovations', 'secrets', 'hacks'],
  },
  COMPARISON: {
    name: 'Comparison',
    structure: ['intro', 'option-a', 'option-b', 'verdict', 'recommendation'],
    description: 'Compare products or before/after states',
    bestFor: ['alternatives', 'upgrades', 'value-propositions'],
  },
};

// ============================================================
// HOOK GENERATORS
// ============================================================

export interface HookGeneratorParams {
  product: Partial<Product>;
  targetAudience: string;
  mainPainPoint: string;
  hookType?: Hook['type'];
}

/**
 * Generate hook variations based on proven patterns
 */
export function generateHooks(params: HookGeneratorParams): Hook[] {
  const { product, targetAudience, mainPainPoint, hookType } = params;
  const hooks: Hook[] = [];

  const hookTemplates: Record<Hook['type'], string[]> = {
    question: [
      `Why are ${targetAudience} obsessed with this?`,
      `Have you been using ${product.category} wrong this whole time?`,
      `What if I told you ${mainPainPoint} isn't your fault?`,
      `Did you know about this ${product.category} hack?`,
    ],
    statement: [
      `This ${product.category} is different and here's why`,
      `I finally found a ${product.category} that actually works`,
      `The ${product.category} that ${targetAudience} are switching to`,
      `Here's what nobody tells you about ${product.category}`,
    ],
    controversy: [
      `Unpopular opinion: Most ${product.category}s are a scam`,
      `Hot take: You don't need expensive ${product.category}`,
      `I'm calling out the ${product.category} industry`,
      `Why I stopped using regular ${product.category}`,
    ],
    curiosity: [
      `Wait until you see what this does...`,
      `I wasn't supposed to show you this`,
      `The ${product.category} secret that went viral`,
      `You won't believe what I found`,
    ],
    transformation: [
      `Day 1 vs Day 30 with ${product.name}`,
      `My ${mainPainPoint} transformation journey`,
      `Before and after using this ${product.category}`,
      `Watch how ${product.name} changed everything`,
    ],
    'pain-point': [
      `Struggling with ${mainPainPoint}? Watch this`,
      `If ${mainPainPoint} is ruining your day, you need this`,
      `Finally! A solution for ${mainPainPoint}`,
      `Stop suffering from ${mainPainPoint}`,
    ],
    'social-proof': [
      `This ${product.category} sold out 5 times`,
      `Over 1M people bought this ${product.category}`,
      `The ${product.category} that TikTok made famous`,
      `Everyone in my comments asked about this`,
    ],
  };

  // Generate hooks for specified type or all types
  const typesToGenerate = hookType ? [hookType] : Object.keys(hookTemplates) as Hook['type'][];

  for (const type of typesToGenerate) {
    const templates = hookTemplates[type];
    for (const template of templates) {
      hooks.push({
        type,
        text: template,
        durationSeconds: 3,
        effectiveness: getHookEffectiveness(type, product.category || ''),
      });
    }
  }

  return hooks;
}

/**
 * Calculate hook effectiveness based on type and category
 */
function getHookEffectiveness(type: Hook['type'], category: string): number {
  const baseEffectiveness: Record<Hook['type'], number> = {
    question: 82,
    statement: 75,
    controversy: 90,
    curiosity: 88,
    transformation: 92,
    'pain-point': 87,
    'social-proof': 85,
  };

  // Category bonuses
  const categoryBonuses: Record<string, Partial<Record<Hook['type'], number>>> = {
    beauty: { transformation: 5, 'social-proof': 3 },
    fitness: { transformation: 8, 'pain-point': 3 },
    tech: { curiosity: 5, statement: 3 },
    home: { 'pain-point': 5, statement: 3 },
    fashion: { 'social-proof': 5, transformation: 3 },
  };

  const base = baseEffectiveness[type];
  const bonus = categoryBonuses[category.toLowerCase()]?.[type] || 0;

  return Math.min(base + bonus, 100);
}

// ============================================================
// SCRIPT GENERATION
// ============================================================

export interface ScriptGeneratorParams {
  product: Partial<Product>;
  framework: keyof typeof SCRIPT_FRAMEWORKS;
  hook: Hook;
  targetDuration: number; // in seconds
  targetAudience: string;
  mainPainPoint: string;
  tone?: 'casual' | 'professional' | 'energetic' | 'relatable';
}

/**
 * Generate a complete script based on framework and parameters
 */
export function generateScript(params: ScriptGeneratorParams): ScriptStructure {
  const { product, framework, hook, targetDuration, mainPainPoint, tone = 'casual' } = params;
  const fw = SCRIPT_FRAMEWORKS[framework];

  // Calculate time allocation per section
  const sectionCount = fw.structure.length;
  const avgSectionTime = targetDuration / sectionCount;

  // Generate script sections based on framework
  const scriptSections = generateFrameworkSections(fw, {
    product,
    hook,
    mainPainPoint,
    tone,
    sectionTime: avgSectionTime,
  });

  return {
    hook,
    problemAgitation: scriptSections.problem || scriptSections.agitation || '',
    solution: scriptSections.solution || scriptSections.reveal || '',
    productIntro: scriptSections.product || `This is ${product.name}`,
    demonstration: scriptSections.demo || scriptSections.results || '',
    socialProof: scriptSections.proof,
    callToAction: scriptSections.cta || 'Link in bio to grab yours!',
    totalDuration: targetDuration,
  };
}

interface SectionGeneratorParams {
  product: Partial<Product>;
  hook: Hook;
  mainPainPoint: string;
  tone: string;
  sectionTime: number;
}

function generateFrameworkSections(
  framework: typeof SCRIPT_FRAMEWORKS[keyof typeof SCRIPT_FRAMEWORKS],
  params: SectionGeneratorParams
): Record<string, string> {
  const { product, hook, mainPainPoint, tone } = params;
  const sections: Record<string, string> = {};

  // Tone-specific language
  const toneModifiers = {
    casual: { intensity: 'pretty', exclaim: '!', connector: 'so' },
    professional: { intensity: 'significantly', exclaim: '.', connector: 'therefore' },
    energetic: { intensity: 'SUPER', exclaim: '!!!', connector: 'and' },
    relatable: { intensity: 'honestly', exclaim: '...', connector: 'like' },
  };

  const tm = toneModifiers[tone as keyof typeof toneModifiers] || toneModifiers.casual;

  // Generate sections based on framework structure
  for (const section of framework.structure) {
    switch (section) {
      case 'hook':
      case 'attention':
      case 'mystery-hook':
        sections[section] = hook.text;
        break;

      case 'problem':
      case 'before':
      case 'show-problem':
      case 'conflict':
        sections[section] = `${mainPainPoint} is ${tm.intensity} frustrating${tm.exclaim}`;
        break;

      case 'agitation':
      case 'interest':
      case 'build-tension':
        sections[section] = `You've probably tried everything, ${tm.connector} nothing works${tm.exclaim}`;
        break;

      case 'solution':
      case 'bridge':
      case 'resolution':
      case 'demonstrate-solution':
        sections[section] = `That's why I found ${product.name}${tm.exclaim}`;
        break;

      case 'product':
      case 'product-reveal':
      case 'partial-reveal':
      case 'full-reveal':
        sections[section] = `${product.name} ${product.keyBenefits?.[0] || 'solves this problem'}${tm.exclaim}`;
        break;

      case 'after':
      case 'results':
      case 'desire':
        sections[section] = `Now my ${mainPainPoint.split(' ')[0]} is ${tm.intensity} better${tm.exclaim}`;
        break;

      case 'proof':
      case 'viral-claim':
        sections[section] = `Thousands of people are already using this${tm.exclaim}`;
        break;

      case 'personal-experience':
        sections[section] = `I've been using it for weeks ${tm.connector} I'm obsessed${tm.exclaim}`;
        break;

      case 'cta':
      case 'action':
      case 'recommendation':
        sections[section] = `Grab yours from my TikTok Shop${tm.exclaim}`;
        break;

      case 'setup':
      case 'intro':
        sections[section] = `Let me show you something${tm.exclaim}`;
        break;

      case 'option-a':
        sections[section] = `Option A: the regular way${tm.exclaim}`;
        break;

      case 'option-b':
        sections[section] = `Option B: with ${product.name}${tm.exclaim}`;
        break;

      case 'verdict':
        sections[section] = `The difference is ${tm.intensity} clear${tm.exclaim}`;
        break;
    }
  }

  return sections;
}

// ============================================================
// CONTENT BRIEF GENERATION
// ============================================================

export interface ContentBriefParams {
  product: Partial<Product>;
  viralAnalyses?: ViralAnalysis[];
  scriptsToGenerate: number;
  platforms: string[];
}

/**
 * Generate multiple content briefs from viral analyses
 */
export function generateContentBriefs(params: ContentBriefParams): ContentBrief[] {
  const { product, viralAnalyses = [], scriptsToGenerate, platforms } = params;
  const briefs: ContentBrief[] = [];

  // Generate briefs inspired by viral content
  for (let i = 0; i < scriptsToGenerate; i++) {
    const analysis = viralAnalyses[i % viralAnalyses.length];
    const framework = Object.keys(SCRIPT_FRAMEWORKS)[i % Object.keys(SCRIPT_FRAMEWORKS).length] as keyof typeof SCRIPT_FRAMEWORKS;

    // Generate hook for this brief
    const hooks = generateHooks({
      product,
      targetAudience: product.targetDemographic || 'consumers',
      mainPainPoint: 'everyday struggles',
    });
    const hook = hooks[i % hooks.length];

    // Generate script structure
    const script = generateScript({
      product,
      framework,
      hook,
      targetDuration: 30 + (i % 3) * 15, // 30, 45, or 60 seconds
      targetAudience: product.targetDemographic || 'consumers',
      mainPainPoint: 'common problem',
      tone: ['casual', 'energetic', 'relatable'][i % 3] as 'casual' | 'energetic' | 'relatable',
    });

    // Build script text
    const scriptText = [
      `[HOOK - 3s] ${script.hook.text}`,
      `[PROBLEM - 5s] ${script.problemAgitation}`,
      `[SOLUTION - 5s] ${script.solution}`,
      `[PRODUCT - 8s] ${script.productIntro}`,
      `[DEMO - 7s] ${script.demonstration}`,
      script.socialProof ? `[PROOF - 3s] ${script.socialProof}` : '',
      `[CTA - 3s] ${script.callToAction}`,
    ].filter(Boolean).join('\n\n');

    briefs.push({
      id: uuidv4(),
      title: `${product.name} - ${framework} Script #${i + 1}`,
      hook,
      script: scriptText,
      visualDirection: generateVisualDirection(framework, product),
      soundDirection: generateSoundDirection(framework),
      duration: script.totalDuration,
      productPlacement: 'Natural integration at 10-15s mark, close-up at demo section',
      callToAction: script.callToAction,
      hashtags: generateHashtags(product, platforms[0]),
      inspiredBy: analysis?.videoId,
    });
  }

  return briefs;
}

/**
 * Generate visual direction for a content brief
 */
function generateVisualDirection(
  framework: keyof typeof SCRIPT_FRAMEWORKS,
  product: Partial<Product>
): string[] {
  const commonDirections = [
    'Natural lighting, phone-quality aesthetic',
    'POV/first-person angle',
    'Text overlays on key points',
    `Product close-up shots of ${product.name}`,
    'Quick cuts between scenes (1-2s each)',
  ];

  const frameworkSpecific: Record<keyof typeof SCRIPT_FRAMEWORKS, string[]> = {
    PAS: ['Start with frustrated facial expression', 'Transition to relieved/happy when showing solution'],
    AIDA: ['Open with attention-grabbing visual', 'Build visual interest progressively'],
    BAB: ['Split screen or side-by-side comparison', 'Clear before/after transformation'],
    STORY: ['Authentic, slice-of-life scenes', 'Emotional journey visible in expressions'],
    DEMO: ['Clear product demonstration', 'Zoom on product features', 'Results clearly visible'],
    SOCIAL_PROOF: ['Show popularity indicators', 'Include "viral" visual cues', 'Comment screenshots'],
    CURIOSITY: ['Hide product initially', 'Progressive reveal', 'Build anticipation visually'],
    COMPARISON: ['Side-by-side format', 'Clear labels', 'Obvious winner visual'],
  };

  return [...frameworkSpecific[framework], ...commonDirections];
}

/**
 * Generate sound direction for a content brief
 */
function generateSoundDirection(framework: keyof typeof SCRIPT_FRAMEWORKS): string {
  const directions: Record<keyof typeof SCRIPT_FRAMEWORKS, string> = {
    PAS: 'Voiceover with subtle tension-building background music, transition to upbeat at solution',
    AIDA: 'Trending sound with voiceover, build energy throughout',
    BAB: 'Split audio - muted/sad before, vibrant after',
    STORY: 'Personal voiceover, emotional background music',
    DEMO: 'Clear instructional voiceover, satisfying sound effects on results',
    SOCIAL_PROOF: 'Trending viral sound, energetic and popular',
    CURIOSITY: 'Mystery/suspense building audio, satisfying reveal sound',
    COMPARISON: 'Neutral comparison tone, dramatic reveal audio',
  };

  return directions[framework];
}

/**
 * Generate relevant hashtags for a product and platform
 */
function generateHashtags(product: Partial<Product>, platform: string): string[] {
  const base = ['#fyp', '#foryou', '#viral', '#tiktokshop'];

  const categoryTags: Record<string, string[]> = {
    beauty: ['#beautytok', '#skincare', '#makeuptok', '#beautyhacks'],
    fitness: ['#fitnesstok', '#workout', '#gymtok', '#healthtok'],
    home: ['#hometok', '#homehacks', '#organization', '#cleaningtok'],
    tech: ['#techtok', '#gadgets', '#techhacks', '#innovation'],
    fashion: ['#fashiontok', '#ootd', '#style', '#outfitinspo'],
    food: ['#foodtok', '#recipe', '#cooking', '#foodhacks'],
  };

  const category = product.category?.toLowerCase() || 'general';
  const categorySpecific = categoryTags[category] || ['#trending', '#musthave'];

  const productTags = [
    `#${product.name?.replace(/\s+/g, '').toLowerCase() || 'product'}`,
    `#${category}`,
    '#tiktokshopfinds',
    '#tiktokmademebuyit',
  ];

  return [...base, ...categorySpecific, ...productTags];
}

/**
 * Generate prompt for Claude to create custom scripts
 */
export function generateScriptCreationPrompt(
  product: Partial<Product>,
  viralAnalyses: ViralAnalysis[],
  count: number
): string {
  return `
# TikTok Shop Script Generation

## Product Information
**Name:** ${product.name}
**Category:** ${product.category}
**Price:** $${product.price}
**Key Benefits:**
${product.keyBenefits?.map(b => `- ${b}`).join('\n') || '- To be highlighted'}
**Target Audience:** ${product.targetDemographic}

## Viral Content Inspiration
${viralAnalyses.slice(0, 5).map((a, i) => `
### Reference ${i + 1}
- **Why it worked:** ${a.whyItWorks.join(', ')}
- **Hook type:** ${a.hooks[0]?.type}
- **Hook text:** ${a.hooks[0]?.text}
- **Repurpose angles:** ${a.repurposeAngles.slice(0, 3).join(', ')}
`).join('\n')}

## Script Requirements
Generate ${count} unique TikTok scripts for ${product.name}.

For each script, provide:
1. **Title** - Descriptive name for the content piece
2. **Hook** (0-3s) - Attention-grabbing opener
3. **Problem/Setup** (3-8s) - Context and pain point
4. **Solution** (8-13s) - Introduction of product
5. **Demo/Proof** (13-22s) - Show product in action
6. **Social Proof** (22-26s) - Testimonial or popularity
7. **CTA** (26-30s) - Clear call to action
8. **Visual Direction** - Shot-by-shot visual guidance
9. **Sound Direction** - Audio/music recommendations
10. **Hashtags** - 5-7 relevant tags

## Script Frameworks to Use
Use a mix of these frameworks:
${Object.entries(SCRIPT_FRAMEWORKS).map(([key, fw]) => `- **${key}**: ${fw.description}`).join('\n')}

## Tone Guidelines
- Authentic UGC feel (not polished ads)
- Conversational and relatable
- Slightly energetic but not over-the-top
- Focus on genuine benefits, not hype

## Output Format
Provide each script in a structured format ready for production.
`;
}

export default {
  SCRIPT_FRAMEWORKS,
  generateHooks,
  generateScript,
  generateContentBriefs,
  generateScriptCreationPrompt,
};
