/**
 * Image Generation Module
 *
 * Integrates with Nano Banana Pro and other image generation tools
 * for creating UGC-style images for TikTok Shop content.
 */

import { v4 as uuidv4 } from 'uuid';
import { GeneratedImage, ContentBrief, Product } from '../types.js';

// ============================================================
// NANO BANANA INTEGRATION
// ============================================================

export interface NanoBananaConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export interface ImageGenerationParams {
  prompt: string;
  style: GeneratedImage['style'];
  aspectRatio?: '9:16' | '1:1' | '16:9';
  negativePrompt?: string;
  referenceImage?: string;
  seed?: number;
}

/**
 * UGC-style image prompt templates
 */
export const UGC_STYLE_TEMPLATES = {
  selfie: {
    prefix: 'iPhone photo, selfie style, natural lighting, casual setting',
    suffix: ', authentic, unedited, real person, relatable aesthetic',
    negatives: 'professional photography, studio lighting, edited, airbrushed, perfect skin',
  },
  productInHand: {
    prefix: 'POV shot, hand holding product, natural background, iPhone quality',
    suffix: ', authentic user photo, everyday setting, casual',
    negatives: 'professional product shot, white background, studio, advertisement',
  },
  lifestyle: {
    prefix: 'Candid lifestyle photo, natural moment, real environment',
    suffix: ', Instagram aesthetic, relatable, authentic content creator style',
    negatives: 'posed, professional, stock photo, advertisement, commercial',
  },
  beforeAfter: {
    prefix: 'Before and after comparison, side by side, same angle',
    suffix: ', transformation result, real results, honest comparison',
    negatives: 'edited, photoshopped, fake results, exaggerated',
  },
  unboxing: {
    prefix: 'Unboxing photo, package opening moment, excited expression',
    suffix: ', first impression, genuine reaction, iPhone selfie style',
    negatives: 'professional unboxing, studio, edited, sponsored look',
  },
  testimonial: {
    prefix: 'Happy customer photo, genuine smile, holding product',
    suffix: ', real review, satisfied customer, authentic moment',
    negatives: 'model, actor, fake smile, professional, commercial',
  },
};

/**
 * Generate UGC-style image prompt from content brief
 */
export function generateImagePrompt(
  brief: ContentBrief,
  product: Partial<Product>,
  style: keyof typeof UGC_STYLE_TEMPLATES
): string {
  const template = UGC_STYLE_TEMPLATES[style];

  const basePrompt = `${template.prefix}, ${product.name} product, ${brief.visualDirection.slice(0, 2).join(', ')}${template.suffix}`;

  return basePrompt;
}

/**
 * Generate negative prompt for UGC style
 */
export function generateNegativePrompt(style: keyof typeof UGC_STYLE_TEMPLATES): string {
  const template = UGC_STYLE_TEMPLATES[style];
  return template.negatives;
}

/**
 * Generate Nano Banana API request
 */
export async function generateWithNanoBanana(
  params: ImageGenerationParams,
  config?: NanoBananaConfig
): Promise<GeneratedImage> {
  const id = uuidv4();

  // Generate the full prompt with style modifiers
  const styleTemplate = UGC_STYLE_TEMPLATES[params.style] || UGC_STYLE_TEMPLATES.lifestyle;
  const fullPrompt = `${styleTemplate.prefix}, ${params.prompt}${styleTemplate.suffix}`;
  const negativePrompt = params.negativePrompt || styleTemplate.negatives;

  // Log the API request that would be made
  console.log('Nano Banana Image Generation Request:');
  console.log({
    prompt: fullPrompt,
    negativePrompt,
    aspectRatio: params.aspectRatio || '9:16',
    style: params.style,
    seed: params.seed,
  });

  // In production, this would call Nano Banana API
  // const response = await fetch(`${config?.baseUrl}/generate`, {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${config?.apiKey}` },
  //   body: JSON.stringify({ prompt: fullPrompt, ... })
  // });

  return {
    id,
    briefId: '',
    prompt: fullPrompt,
    style: params.style,
    url: undefined,
    localPath: undefined,
    status: 'pending',
  };
}

// ============================================================
// BATCH IMAGE GENERATION
// ============================================================

export interface BatchImageParams {
  briefs: ContentBrief[];
  product: Partial<Product>;
  imagesPerBrief: number;
  styles: GeneratedImage['style'][];
}

/**
 * Generate batch of images for multiple content briefs
 */
export async function generateBatchImages(
  params: BatchImageParams,
  config?: NanoBananaConfig
): Promise<GeneratedImage[]> {
  const { briefs, product, imagesPerBrief, styles } = params;
  const allImages: GeneratedImage[] = [];

  for (const brief of briefs) {
    for (let i = 0; i < imagesPerBrief; i++) {
      const style = styles[i % styles.length];
      const prompt = generateImagePrompt(brief, product, style as keyof typeof UGC_STYLE_TEMPLATES);

      const image = await generateWithNanoBanana(
        {
          prompt,
          style,
          aspectRatio: '9:16', // TikTok format
        },
        config
      );

      image.briefId = brief.id;
      allImages.push(image);
    }
  }

  return allImages;
}

// ============================================================
// IMAGE PROMPT GENERATION FOR DIFFERENT SCENES
// ============================================================

export interface ScenePromptParams {
  scene: 'hook' | 'problem' | 'solution' | 'demo' | 'result' | 'cta';
  product: Partial<Product>;
  targetAudience: string;
  setting?: string;
}

/**
 * Generate scene-specific image prompts for video frames
 */
export function generateScenePrompts(params: ScenePromptParams): string[] {
  const { scene, product, targetAudience, setting = 'home' } = params;

  const scenePrompts: Record<string, string[]> = {
    hook: [
      `Close-up reaction face, surprised expression, ${targetAudience} person, ${setting} background`,
      `POV looking at phone, discovering something exciting, ${setting} setting`,
      `Hand reaching for ${product.name}, anticipation moment`,
    ],
    problem: [
      `Frustrated person dealing with problem, ${setting}, relatable moment`,
      `Before situation, messy or difficult scenario, ${targetAudience} person`,
      `Struggling with everyday task, ${setting} environment`,
    ],
    solution: [
      `${product.name} product reveal, clean background, good lighting`,
      `Unboxing ${product.name}, excited expression, ${targetAudience} person`,
      `Holding ${product.name} packaging, ${setting} background`,
    ],
    demo: [
      `Using ${product.name}, demonstration shot, clear view of product`,
      `${product.name} in action, hands-on usage, ${setting}`,
      `Close-up of ${product.name} being applied/used, detail shot`,
    ],
    result: [
      `Happy result after using ${product.name}, satisfied expression`,
      `After transformation, clean and satisfied, ${targetAudience}`,
      `Showing off results, proud moment, ${setting}`,
    ],
    cta: [
      `Holding ${product.name}, smile, looking at camera, ${targetAudience}`,
      `${product.name} with happy customer, recommendation pose`,
      `Final shot with product, call to action moment`,
    ],
  };

  return scenePrompts[scene] || scenePrompts.demo;
}

// ============================================================
// IMAGE STYLE PRESETS
// ============================================================

export const IMAGE_STYLE_PRESETS = {
  tiktokUGC: {
    aspectRatio: '9:16' as const,
    quality: 'high',
    style: 'ugc' as const,
    lighting: 'natural',
    camera: 'iPhone 15 Pro',
    postProcessing: 'minimal',
  },
  instagramStory: {
    aspectRatio: '9:16' as const,
    quality: 'high',
    style: 'lifestyle' as const,
    lighting: 'golden hour',
    camera: 'iPhone',
    postProcessing: 'light filter',
  },
  productShot: {
    aspectRatio: '1:1' as const,
    quality: 'ultra',
    style: 'product-shot' as const,
    lighting: 'soft studio',
    camera: 'professional',
    postProcessing: 'color correction',
  },
  testimonialCard: {
    aspectRatio: '9:16' as const,
    quality: 'high',
    style: 'testimonial' as const,
    lighting: 'natural indoor',
    camera: 'iPhone selfie',
    postProcessing: 'none',
  },
};

/**
 * Generate complete image prompt with all style parameters
 */
export function generateCompletePrompt(
  basePrompt: string,
  preset: keyof typeof IMAGE_STYLE_PRESETS
): { prompt: string; negativePrompt: string; settings: typeof IMAGE_STYLE_PRESETS[keyof typeof IMAGE_STYLE_PRESETS] } {
  const settings = IMAGE_STYLE_PRESETS[preset];

  const styleModifiers: Record<string, string> = {
    tiktokUGC: 'shot on iPhone, UGC style, vertical format, TikTok aesthetic, authentic content creator',
    instagramStory: 'Instagram story format, aesthetic filter, lifestyle content, influencer style',
    productShot: 'product photography, clean background, professional lighting, e-commerce style',
    testimonialCard: 'customer photo, genuine expression, testimonial style, before-after format',
  };

  const negativeModifiers: Record<string, string> = {
    tiktokUGC: 'professional photography, studio lighting, advertisement, commercial, edited, airbrushed',
    instagramStory: 'low quality, blurry, over-edited, fake looking',
    productShot: 'cluttered background, poor lighting, amateur, low quality',
    testimonialCard: 'fake, actor, model, professional, stock photo',
  };

  return {
    prompt: `${basePrompt}, ${styleModifiers[preset]}`,
    negativePrompt: negativeModifiers[preset],
    settings,
  };
}

// ============================================================
// PROMPT GENERATION FOR MANUAL/CLAUDE EXECUTION
// ============================================================

/**
 * Generate comprehensive image generation prompt for Claude
 */
export function generateImageCreationPrompt(
  briefs: ContentBrief[],
  product: Partial<Product>
): string {
  return `
# UGC Image Generation for TikTok Shop

## Product Information
**Name:** ${product.name}
**Category:** ${product.category}
**Key Visual Elements:** ${product.images?.join(', ') || 'Product packaging, product in use'}

## Content Briefs Requiring Images
${briefs.map((brief, i) => `
### Brief ${i + 1}: ${brief.title}
**Duration:** ${brief.duration}s
**Visual Direction:** ${brief.visualDirection.join('; ')}
**Hook:** ${brief.hook.text}
`).join('\n')}

## Image Requirements Per Brief

For each brief, generate prompts for these key frames:

### 1. Hook Frame (0-3s)
- Attention-grabbing opening shot
- Expression or scenario that creates curiosity
- UGC selfie or POV style

### 2. Problem Frame (3-8s)
- Visual representation of pain point
- Relatable frustrated/struggling moment
- Authentic, not acted

### 3. Solution Frame (8-15s)
- Product introduction shot
- Unboxing or first reveal moment
- Excited/hopeful expression

### 4. Demo Frames (15-22s)
- Product in action (2-3 shots)
- Close-up of key features
- Before/during/after if applicable

### 5. Result Frame (22-27s)
- Happy outcome shot
- Transformation visible
- Satisfied customer moment

### 6. CTA Frame (27-30s)
- Product hero shot
- Clear call to action composition
- Brand/shop visible

## Style Guidelines
- iPhone quality (not too polished)
- Natural lighting preferred
- Real environment backgrounds
- Authentic expressions
- 9:16 aspect ratio (TikTok format)

## Technical Specifications
- Resolution: 1080x1920 minimum
- Format: PNG or JPG
- No watermarks
- No text overlays (added separately)

## Negative Prompt Elements (Avoid)
- Professional studio lighting
- Perfect/airbrushed skin
- Stock photo aesthetics
- Commercial advertisement look
- Overly edited/filtered
- Fake or forced expressions
`;
}

export default {
  UGC_STYLE_TEMPLATES,
  IMAGE_STYLE_PRESETS,
  generateImagePrompt,
  generateNegativePrompt,
  generateWithNanoBanana,
  generateBatchImages,
  generateScenePrompts,
  generateCompletePrompt,
  generateImageCreationPrompt,
};
