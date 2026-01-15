import { z } from 'zod';

// ============================================
// Input Schemas
// ============================================

export const BrandInputSchema = z.object({
  name: z.string(),
  website: z.string().url().optional(),
  description: z.string().optional(),
  guidelines: z.string().optional(),
  colors: z.array(z.string()).optional(),
  tone: z.string().optional(),
  targetAudience: z.string().optional(),
});

export const CampaignInputSchema = z.object({
  brand: BrandInputSchema,
  product: z.string().optional(),
  goal: z.enum(['awareness', 'consideration', 'conversion']).optional(),
  competitors: z.array(z.string()).optional(),
  budget: z.string().optional(),
  platforms: z.array(z.enum(['meta', 'google', 'tiktok', 'linkedin'])).optional(),
});

export type BrandInput = z.infer<typeof BrandInputSchema>;
export type CampaignInput = z.infer<typeof CampaignInputSchema>;

// ============================================
// Research Output
// ============================================

export interface CompetitorInsight {
  name: string;
  website: string;
  trafficEstimate?: string;
  topKeywords?: string[];
  trafficSources?: {
    organic: number;
    paid: number;
    social: number;
    direct: number;
    referral: number;
  };
  topPages?: string[];
  adExamples?: string[];
}

export interface MarketResearch {
  competitors: CompetitorInsight[];
  industryTrends: string[];
  marketSize?: string;
  growthRate?: string;
  seasonality?: string[];
}

// ============================================
// Keyword Research
// ============================================

export interface KeywordData {
  keyword: string;
  searchVolume?: number;
  difficulty?: number;
  cpc?: number;
  intent: 'informational' | 'navigational' | 'commercial' | 'transactional';
  relevanceScore: number;
}

export interface NicheKeywords {
  primary: KeywordData[];
  longTail: KeywordData[];
  questions: string[];
  relatedTopics: string[];
  gaps: string[]; // Keywords competitors miss
}

// ============================================
// Brand Analysis
// ============================================

export interface BrandAnalysis {
  positioning: string;
  uniqueValueProposition: string;
  toneOfVoice: {
    adjectives: string[];
    examples: string[];
  };
  visualIdentity: {
    primaryColors: string[];
    secondaryColors: string[];
    fontStyle: string;
    imageStyle: string;
  };
  messagingPillars: string[];
  doNots: string[];
}

// ============================================
// Customer Avatar
// ============================================

export interface CustomerAvatar {
  name: string;
  demographics: {
    ageRange: string;
    gender?: string;
    location?: string;
    income?: string;
    education?: string;
  };
  psychographics: {
    values: string[];
    interests: string[];
    painPoints: string[];
    goals: string[];
    fears: string[];
  };
  behaviors: {
    mediaConsumption: string[];
    purchaseDrivers: string[];
    objections: string[];
  };
  messagingAngle: string;
}

// ============================================
// Creative Output
// ============================================

export interface Headline {
  text: string;
  type: 'benefit' | 'curiosity' | 'social-proof' | 'urgency' | 'question';
  targetAvatar: string;
  angle: string;
}

export interface VisualConcept {
  description: string;
  style: string;
  elements: string[];
  colorScheme: string[];
  moodReference: string;
}

export interface StaticAdVariation {
  id: string;
  headline: Headline;
  subheadline?: string;
  bodyCopy: string;
  cta: string;
  visual: VisualConcept;
  platform: string;
  dimensions: string;
  targetAvatar: string;
}

export interface UGCVideoAd {
  id: string;
  hook: string; // First 3 seconds
  script: {
    timestamp: string;
    speaker: string;
    dialogue: string;
    visualDirection: string;
  }[];
  duration: string;
  style: 'testimonial' | 'problem-solution' | 'tutorial' | 'unboxing' | 'day-in-life';
  creatorBrief: {
    creatorType: string;
    setting: string;
    props: string[];
    toneNotes: string;
  };
  targetAvatar: string;
}

// ============================================
// Final Output
// ============================================

export interface AdCreativeOutput {
  campaign: CampaignInput;
  research: MarketResearch;
  keywords: NicheKeywords;
  brandAnalysis: BrandAnalysis;
  avatars: CustomerAvatar[];
  staticAds: StaticAdVariation[];
  ugcVideoAds: UGCVideoAd[];
  generatedAt: string;
}
