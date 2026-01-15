import { z } from 'zod';

// ============================================================
// PRODUCT & CAMPAIGN INPUT SCHEMAS
// ============================================================

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number(),
  category: z.string(),
  tiktokShopUrl: z.string().url().optional(),
  amazonUrl: z.string().url().optional(),
  affiliateCommission: z.number().optional(),
  keyBenefits: z.array(z.string()),
  targetDemographic: z.string(),
  images: z.array(z.string()),
});

export const CampaignInputSchema = z.object({
  product: ProductSchema,
  niche: z.string(),
  competitors: z.array(z.string()),
  dailyPostTarget: z.number().default(3),
  platforms: z.array(z.enum(['tiktok', 'instagram', 'youtube-shorts', 'facebook'])),
  contentStyle: z.enum(['ugc', 'product-demo', 'lifestyle', 'educational', 'mixed']),
  toneOfVoice: z.string().optional(),
});

// ============================================================
// VIRAL CONTENT RESEARCH SCHEMAS
// ============================================================

export const ViralVideoSchema = z.object({
  id: z.string(),
  platform: z.string(),
  url: z.string().url(),
  views: z.number(),
  likes: z.number(),
  comments: z.number(),
  shares: z.number(),
  engagementRate: z.number(),
  duration: z.number(), // in seconds
  postedAt: z.string().datetime(),
  creatorHandle: z.string(),
  creatorFollowers: z.number().optional(),
  hashtags: z.array(z.string()),
  soundUsed: z.string().optional(),
  isShoppable: z.boolean(),
  productTags: z.array(z.string()).optional(),
});

export const HookSchema = z.object({
  type: z.enum(['question', 'statement', 'controversy', 'curiosity', 'transformation', 'pain-point', 'social-proof']),
  text: z.string(),
  durationSeconds: z.number(),
  effectiveness: z.number().min(0).max(100),
});

export const ScriptStructureSchema = z.object({
  hook: HookSchema,
  problemAgitation: z.string(),
  solution: z.string(),
  productIntro: z.string(),
  demonstration: z.string(),
  socialProof: z.string().optional(),
  callToAction: z.string(),
  totalDuration: z.number(),
});

export const ViralAnalysisSchema = z.object({
  videoId: z.string(),
  whyItWorks: z.array(z.string()),
  hooks: z.array(HookSchema),
  scriptStructure: ScriptStructureSchema,
  visualTechniques: z.array(z.string()),
  audioElements: z.array(z.string()),
  repurposeAngles: z.array(z.string()),
});

// ============================================================
// CONTENT GENERATION SCHEMAS
// ============================================================

export const ContentBriefSchema = z.object({
  id: z.string(),
  title: z.string(),
  hook: HookSchema,
  script: z.string(),
  visualDirection: z.array(z.string()),
  soundDirection: z.string(),
  duration: z.number(),
  productPlacement: z.string(),
  callToAction: z.string(),
  hashtags: z.array(z.string()),
  inspiredBy: z.string().optional(), // reference to viral video
});

export const GeneratedImageSchema = z.object({
  id: z.string(),
  briefId: z.string(),
  prompt: z.string(),
  style: z.enum(['ugc', 'product-shot', 'lifestyle', 'before-after', 'testimonial']),
  url: z.string().optional(),
  localPath: z.string().optional(),
  status: z.enum(['pending', 'generating', 'completed', 'failed']),
});

export const GeneratedVideoSchema = z.object({
  id: z.string(),
  briefId: z.string(),
  prompt: z.string(),
  imageInputs: z.array(z.string()),
  duration: z.number(),
  aspectRatio: z.enum(['9:16', '1:1', '16:9']),
  url: z.string().optional(),
  localPath: z.string().optional(),
  status: z.enum(['pending', 'generating', 'completed', 'failed']),
  generationTool: z.enum(['kling', 'veo3', 'runway', 'pika']),
});

// ============================================================
// ACCOUNT MANAGEMENT SCHEMAS
// ============================================================

export const CreatorProfileSchema = z.object({
  id: z.string(),
  platform: z.string(),
  handle: z.string(),
  displayName: z.string(),
  bio: z.string(),
  profileImage: z.string().optional(),
  niche: z.string(),
  style: z.string(),
  tiktokShopLinked: z.boolean(),
  affiliateStatus: z.enum(['pending', 'approved', 'rejected']),
  createdAt: z.string().datetime(),
  lastPostAt: z.string().datetime().optional(),
  totalPosts: z.number().default(0),
  totalViews: z.number().default(0),
  totalGMV: z.number().default(0), // Gross Merchandise Value
});

export const AccountCredentialsSchema = z.object({
  profileId: z.string(),
  platform: z.string(),
  authMethod: z.enum(['oauth', 'session', 'api-key']),
  // credentials stored securely, not in plain text
  credentialRef: z.string(),
  lastRefreshed: z.string().datetime(),
  isValid: z.boolean(),
});

// ============================================================
// POSTING & SCHEDULING SCHEMAS
// ============================================================

export const PostSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  videoId: z.string(),
  platform: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  productLinks: z.array(z.string()),
  scheduledAt: z.string().datetime(),
  postedAt: z.string().datetime().optional(),
  status: z.enum(['scheduled', 'posting', 'posted', 'failed']),
  postUrl: z.string().optional(),
  metrics: z.object({
    views: z.number().default(0),
    likes: z.number().default(0),
    comments: z.number().default(0),
    shares: z.number().default(0),
    clicks: z.number().default(0),
    purchases: z.number().default(0),
    gmv: z.number().default(0),
  }).optional(),
});

export const PostingScheduleSchema = z.object({
  profileId: z.string(),
  timezone: z.string(),
  postsPerDay: z.number(),
  optimalTimes: z.array(z.string()), // HH:MM format
  daysActive: z.array(z.number().min(0).max(6)), // 0 = Sunday
});

// ============================================================
// MULTI-PLATFORM SWARM SCHEMAS
// ============================================================

export const SwarmCampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  productId: z.string(),
  originalVideoId: z.string(),
  variations: z.array(z.object({
    id: z.string(),
    hookVariation: z.string(),
    visualVariation: z.string(),
    platform: z.string(),
    status: z.enum(['pending', 'created', 'deployed']),
  })),
  targetPlatforms: z.array(z.string()),
  targetAccounts: z.array(z.string()),
  deploymentStrategy: z.enum(['simultaneous', 'staggered', 'wave']),
  startDate: z.string().datetime(),
  metrics: z.object({
    totalViews: z.number().default(0),
    totalEngagement: z.number().default(0),
    totalGMV: z.number().default(0),
    bestPerforming: z.string().optional(),
  }),
});

// ============================================================
// PIPELINE STATE SCHEMAS
// ============================================================

export const PipelineStateSchema = z.object({
  campaignId: z.string(),
  currentStep: z.enum([
    'research',
    'analysis',
    'brief-generation',
    'image-generation',
    'video-generation',
    'account-setup',
    'scheduling',
    'posting',
    'swarm-deployment',
    'monitoring',
    'completed',
  ]),
  research: z.object({
    viralVideos: z.array(ViralVideoSchema),
    analyses: z.array(ViralAnalysisSchema),
    status: z.enum(['pending', 'in-progress', 'completed']),
  }).optional(),
  content: z.object({
    briefs: z.array(ContentBriefSchema),
    images: z.array(GeneratedImageSchema),
    videos: z.array(GeneratedVideoSchema),
    status: z.enum(['pending', 'in-progress', 'completed']),
  }).optional(),
  posting: z.object({
    scheduledPosts: z.array(PostSchema),
    status: z.enum(['pending', 'in-progress', 'completed']),
  }).optional(),
  swarm: SwarmCampaignSchema.optional(),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  errors: z.array(z.object({
    step: z.string(),
    message: z.string(),
    timestamp: z.string().datetime(),
  })).default([]),
});

// ============================================================
// TYPE EXPORTS
// ============================================================

export type Product = z.infer<typeof ProductSchema>;
export type CampaignInput = z.infer<typeof CampaignInputSchema>;
export type ViralVideo = z.infer<typeof ViralVideoSchema>;
export type Hook = z.infer<typeof HookSchema>;
export type ScriptStructure = z.infer<typeof ScriptStructureSchema>;
export type ViralAnalysis = z.infer<typeof ViralAnalysisSchema>;
export type ContentBrief = z.infer<typeof ContentBriefSchema>;
export type GeneratedImage = z.infer<typeof GeneratedImageSchema>;
export type GeneratedVideo = z.infer<typeof GeneratedVideoSchema>;
export type CreatorProfile = z.infer<typeof CreatorProfileSchema>;
export type AccountCredentials = z.infer<typeof AccountCredentialsSchema>;
export type Post = z.infer<typeof PostSchema>;
export type PostingSchedule = z.infer<typeof PostingScheduleSchema>;
export type SwarmCampaign = z.infer<typeof SwarmCampaignSchema>;
export type PipelineState = z.infer<typeof PipelineStateSchema>;
