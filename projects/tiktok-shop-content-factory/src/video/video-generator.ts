/**
 * Video Generation Module
 *
 * Integrates with Kling 2.6, Veo3, and other AI video generation tools
 * for creating UGC-style TikTok Shop videos.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  GeneratedVideo,
  GeneratedImage,
  ContentBrief,
  Product,
  ScriptStructure,
} from '../types.js';

// ============================================================
// VIDEO GENERATION TOOL CONFIGS
// ============================================================

export interface KlingConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: 'kling-2.5' | 'kling-2.6';
}

export interface Veo3Config {
  apiKey?: string;
  baseUrl?: string;
  projectId?: string;
}

export interface RunwayConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: 'gen-3';
}

export type VideoGeneratorTool = 'kling' | 'veo3' | 'runway' | 'pika';

// ============================================================
// VIDEO GENERATION PARAMETERS
// ============================================================

export interface VideoGenerationParams {
  prompt: string;
  duration: 5 | 10 | 15 | 30;
  aspectRatio: '9:16' | '1:1' | '16:9';
  inputImages?: string[]; // Reference images to animate
  style?: 'realistic' | 'cinematic' | 'ugc' | 'animated';
  motionAmount?: 'subtle' | 'moderate' | 'dynamic';
  cameraMovement?: 'static' | 'pan' | 'zoom' | 'tracking';
  seed?: number;
}

export interface VideoGenerationResult {
  video: GeneratedVideo;
  prompt: string;
  tool: VideoGeneratorTool;
}

// ============================================================
// KLING 2.6 INTEGRATION
// ============================================================

/**
 * Generate video prompt optimized for Kling 2.6
 */
export function generateKlingPrompt(
  brief: ContentBrief,
  product: Partial<Product>,
  scene: 'full' | 'segment'
): string {
  const basePrompt = `UGC-style video, ${product.name} product showcase`;
  const visualElements = brief.visualDirection.slice(0, 3).join(', ');

  if (scene === 'full') {
    return `${basePrompt}. ${brief.script.replace(/\[.*?\]/g, '')}. Visual style: ${visualElements}. Natural iPhone quality, authentic content creator aesthetic, vertical format 9:16.`;
  }

  // Segment-specific prompt
  return `${basePrompt}, ${visualElements}, natural lighting, iPhone quality, authentic UGC style`;
}

/**
 * Generate video with Kling 2.6
 */
export async function generateWithKling(
  params: VideoGenerationParams,
  config?: KlingConfig
): Promise<GeneratedVideo> {
  const id = uuidv4();

  // Build the full prompt with Kling-specific optimizations
  const klingOptimizedPrompt = optimizePromptForKling(params.prompt, params);

  console.log('Kling 2.6 Video Generation Request:');
  console.log({
    prompt: klingOptimizedPrompt,
    duration: params.duration,
    aspectRatio: params.aspectRatio,
    model: config?.model || 'kling-2.6',
    inputImages: params.inputImages?.length || 0,
  });

  // In production, this would call Kling API
  // const response = await fetch(`${config?.baseUrl}/v1/videos/generation`, {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${config?.apiKey}` },
  //   body: JSON.stringify({
  //     prompt: klingOptimizedPrompt,
  //     duration: params.duration,
  //     aspect_ratio: params.aspectRatio,
  //     model: config?.model || 'kling-2.6',
  //     image_inputs: params.inputImages,
  //   })
  // });

  return {
    id,
    briefId: '',
    prompt: klingOptimizedPrompt,
    imageInputs: params.inputImages || [],
    duration: params.duration,
    aspectRatio: params.aspectRatio,
    status: 'pending',
    generationTool: 'kling',
  };
}

/**
 * Optimize prompt for Kling's model
 */
function optimizePromptForKling(prompt: string, params: VideoGenerationParams): string {
  const styleModifiers: Record<string, string> = {
    realistic: 'photorealistic, natural lighting, real-world physics',
    cinematic: 'cinematic quality, professional cinematography, dramatic lighting',
    ugc: 'iPhone video quality, authentic UGC style, natural imperfections, relatable',
    animated: 'smooth animation, stylized motion, consistent style',
  };

  const motionModifiers: Record<string, string> = {
    subtle: 'minimal movement, slight gestures, calm pace',
    moderate: 'natural movement, realistic motion, conversational pace',
    dynamic: 'energetic movement, quick cuts, dynamic action',
  };

  const cameraModifiers: Record<string, string> = {
    static: 'fixed camera, stable shot',
    pan: 'slow pan, smooth horizontal movement',
    zoom: 'gradual zoom, focus pull',
    tracking: 'follow movement, dynamic tracking',
  };

  const style = styleModifiers[params.style || 'ugc'];
  const motion = motionModifiers[params.motionAmount || 'moderate'];
  const camera = cameraModifiers[params.cameraMovement || 'static'];

  return `${prompt}. ${style}. ${motion}. ${camera}. Vertical format, TikTok style.`;
}

// ============================================================
// VEO3 INTEGRATION
// ============================================================

/**
 * Generate video prompt optimized for Veo3
 */
export function generateVeo3Prompt(
  brief: ContentBrief,
  product: Partial<Product>
): string {
  return `Create a vertical UGC-style video for TikTok Shop. Product: ${product.name}.
Hook: "${brief.hook.text}"
Visual direction: ${brief.visualDirection.join('. ')}
Duration: ${brief.duration} seconds
Style: Authentic content creator, iPhone quality, natural lighting, engaging and relatable.`;
}

/**
 * Generate video with Veo3
 */
export async function generateWithVeo3(
  params: VideoGenerationParams,
  config?: Veo3Config
): Promise<GeneratedVideo> {
  const id = uuidv4();

  // Veo3-specific prompt optimization
  const veo3Prompt = optimizePromptForVeo3(params.prompt, params);

  console.log('Veo3 Video Generation Request:');
  console.log({
    prompt: veo3Prompt,
    duration: params.duration,
    aspectRatio: params.aspectRatio,
    referenceImages: params.inputImages?.length || 0,
  });

  // In production, this would call Veo3 API
  // const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-003:generateVideo', {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${config?.apiKey}` },
  //   body: JSON.stringify({
  //     prompt: veo3Prompt,
  //     generation_config: {
  //       duration_seconds: params.duration,
  //       aspect_ratio: params.aspectRatio,
  //     }
  //   })
  // });

  return {
    id,
    briefId: '',
    prompt: veo3Prompt,
    imageInputs: params.inputImages || [],
    duration: params.duration,
    aspectRatio: params.aspectRatio,
    status: 'pending',
    generationTool: 'veo3',
  };
}

/**
 * Optimize prompt for Veo3
 */
function optimizePromptForVeo3(prompt: string, params: VideoGenerationParams): string {
  // Veo3 works well with detailed scene descriptions
  const aspectDesc = params.aspectRatio === '9:16' ? 'vertical mobile format' :
                     params.aspectRatio === '1:1' ? 'square format' : 'landscape format';

  return `${prompt}

Technical specifications:
- Duration: ${params.duration} seconds
- Format: ${aspectDesc}
- Camera: ${params.cameraMovement || 'static'} shot
- Motion intensity: ${params.motionAmount || 'moderate'}
- Quality: High resolution, suitable for social media`;
}

// ============================================================
// MULTI-TOOL VIDEO GENERATION
// ============================================================

/**
 * Generate video using the best available tool
 */
export async function generateVideo(
  params: VideoGenerationParams,
  preferredTool?: VideoGeneratorTool,
  configs?: {
    kling?: KlingConfig;
    veo3?: Veo3Config;
    runway?: RunwayConfig;
  }
): Promise<GeneratedVideo> {
  const tool = preferredTool || selectBestTool(params);

  switch (tool) {
    case 'kling':
      return generateWithKling(params, configs?.kling);
    case 'veo3':
      return generateWithVeo3(params, configs?.veo3);
    case 'runway':
      return generateWithKling(params, configs?.kling); // Fallback to Kling
    case 'pika':
      return generateWithKling(params, configs?.kling); // Fallback to Kling
    default:
      return generateWithKling(params, configs?.kling);
  }
}

/**
 * Select the best tool based on generation parameters
 */
function selectBestTool(params: VideoGenerationParams): VideoGeneratorTool {
  // Tool selection logic based on requirements
  if (params.duration > 15) {
    return 'kling'; // Kling handles longer videos better
  }

  if (params.style === 'realistic' && params.inputImages?.length) {
    return 'kling'; // Kling excels at image-to-video
  }

  if (params.style === 'cinematic') {
    return 'veo3'; // Veo3 has great cinematic quality
  }

  return 'kling'; // Default to Kling 2.6
}

// ============================================================
// BATCH VIDEO GENERATION
// ============================================================

export interface BatchVideoParams {
  briefs: ContentBrief[];
  images: GeneratedImage[];
  product: Partial<Product>;
  tool: VideoGeneratorTool;
  segmented?: boolean; // Generate video in segments or full
}

/**
 * Generate videos for multiple content briefs
 */
export async function generateBatchVideos(
  params: BatchVideoParams
): Promise<GeneratedVideo[]> {
  const { briefs, images, product, tool, segmented = false } = params;
  const videos: GeneratedVideo[] = [];

  for (const brief of briefs) {
    // Find images for this brief
    const briefImages = images.filter(img => img.briefId === brief.id);
    const imageUrls = briefImages.map(img => img.localPath || img.url).filter(Boolean) as string[];

    if (segmented) {
      // Generate video in segments (hook, content, cta)
      const segments = await generateSegmentedVideo(brief, product, imageUrls, tool);
      videos.push(...segments);
    } else {
      // Generate full video
      const videoParams: VideoGenerationParams = {
        prompt: generateKlingPrompt(brief, product, 'full'),
        duration: Math.min(brief.duration, 30) as VideoGenerationParams['duration'],
        aspectRatio: '9:16',
        inputImages: imageUrls,
        style: 'ugc',
        motionAmount: 'moderate',
      };

      const video = await generateVideo(videoParams, tool);
      video.briefId = brief.id;
      videos.push(video);
    }
  }

  return videos;
}

/**
 * Generate video in segments for better control
 */
async function generateSegmentedVideo(
  brief: ContentBrief,
  product: Partial<Product>,
  images: string[],
  tool: VideoGeneratorTool
): Promise<GeneratedVideo[]> {
  const segments: GeneratedVideo[] = [];

  // Segment 1: Hook (0-3s)
  const hookVideo = await generateVideo({
    prompt: `UGC hook video: "${brief.hook.text}". Attention-grabbing opening, ${product.name} tease.`,
    duration: 5,
    aspectRatio: '9:16',
    inputImages: images.slice(0, 1),
    style: 'ugc',
    motionAmount: 'dynamic',
  }, tool);
  hookVideo.briefId = brief.id;
  segments.push(hookVideo);

  // Segment 2: Problem/Solution (3-15s)
  const contentVideo = await generateVideo({
    prompt: `UGC product demo: ${product.name} solving problem. Natural demonstration, authentic reaction.`,
    duration: 10,
    aspectRatio: '9:16',
    inputImages: images.slice(1, 3),
    style: 'ugc',
    motionAmount: 'moderate',
  }, tool);
  contentVideo.briefId = brief.id;
  segments.push(contentVideo);

  // Segment 3: CTA (last 5s)
  const ctaVideo = await generateVideo({
    prompt: `UGC call to action: Happy with ${product.name}, recommending to viewers. "${brief.callToAction}"`,
    duration: 5,
    aspectRatio: '9:16',
    inputImages: images.slice(-1),
    style: 'ugc',
    motionAmount: 'subtle',
  }, tool);
  ctaVideo.briefId = brief.id;
  segments.push(ctaVideo);

  return segments;
}

// ============================================================
// VIDEO PROMPT TEMPLATES
// ============================================================

export const VIDEO_PROMPT_TEMPLATES = {
  productDemo: {
    structure: 'Show product being used, highlight key feature, reveal result',
    motion: 'moderate',
    camera: 'tracking',
    style: 'ugc',
  },
  unboxing: {
    structure: 'Open package, reveal product, show reaction, display features',
    motion: 'dynamic',
    camera: 'static',
    style: 'ugc',
  },
  transformation: {
    structure: 'Show before state, apply product, reveal transformation',
    motion: 'moderate',
    camera: 'static',
    style: 'ugc',
  },
  testimonial: {
    structure: 'Person talking to camera, showing product, demonstrating use',
    motion: 'subtle',
    camera: 'static',
    style: 'ugc',
  },
  comparison: {
    structure: 'Side by side or sequential comparison, clear winner reveal',
    motion: 'moderate',
    camera: 'pan',
    style: 'ugc',
  },
};

// ============================================================
// GENERATION PROMPT FOR CLAUDE
// ============================================================

/**
 * Generate comprehensive video creation prompt for Claude
 */
export function generateVideoCreationPrompt(
  briefs: ContentBrief[],
  product: Partial<Product>,
  tool: VideoGeneratorTool = 'kling'
): string {
  return `
# AI Video Generation for TikTok Shop

## Generation Tool: ${tool.toUpperCase()}
${tool === 'kling' ? '- Using Kling 2.6 for high-quality UGC-style video generation' : ''}
${tool === 'veo3' ? '- Using Google Veo3 for realistic video synthesis' : ''}

## Product Information
**Name:** ${product.name}
**Category:** ${product.category}
**Key Benefits:** ${product.keyBenefits?.join(', ') || 'To be highlighted'}

## Content Briefs to Produce
${briefs.map((brief, i) => `
### Video ${i + 1}: ${brief.title}

**Script:**
${brief.script}

**Duration:** ${brief.duration} seconds
**Visual Direction:** ${brief.visualDirection.join('; ')}
**Sound Direction:** ${brief.soundDirection}
**CTA:** ${brief.callToAction}
**Hashtags:** ${brief.hashtags.join(' ')}
`).join('\n---\n')}

## Video Generation Workflow

### Step 1: Generate Reference Images
For each video, first generate key frame images:
1. Hook frame (0-3s visual)
2. Problem frame (3-8s visual)
3. Solution frame (8-15s visual)
4. Demo frames (15-22s visuals)
5. CTA frame (final shot)

### Step 2: Image-to-Video Generation
Use the generated images as input references for ${tool}:
- Upload images as reference
- Generate 5-10 second clips for each scene
- Use prompts optimized for ${tool}

### Step 3: Video Assembly
Combine generated clips:
1. Arrange in script order
2. Add transitions (subtle, quick cuts preferred)
3. Ensure smooth flow between segments

### Step 4: Audio Addition
Add audio elements:
1. Voiceover based on script
2. Background music (trending sounds if available)
3. Sound effects for emphasis

## ${tool.toUpperCase()} Prompt Guidelines

### For Kling 2.6:
- Keep prompts detailed but concise
- Specify camera movement explicitly
- Include lighting and style descriptors
- Reference "UGC", "iPhone quality", "authentic"

### For Veo3:
- Use natural language descriptions
- Describe the scene cinematically
- Include character actions and emotions
- Specify duration and aspect ratio

## Output Requirements
- Resolution: 1080x1920 (9:16 vertical)
- Duration: ${briefs.map(b => b.duration).join(', ')} seconds
- Format: MP4
- Frame rate: 30fps
- Audio: Stereo, AAC

## Quality Checklist
- [ ] Hook grabs attention in first 1-2 seconds
- [ ] Product clearly visible during demo
- [ ] Natural, authentic UGC aesthetic
- [ ] Smooth motion, no glitches
- [ ] Clear audio (if included)
- [ ] Vertical format correct
- [ ] CTA clear and compelling
`;
}

export default {
  VIDEO_PROMPT_TEMPLATES,
  generateKlingPrompt,
  generateVeo3Prompt,
  generateWithKling,
  generateWithVeo3,
  generateVideo,
  generateBatchVideos,
  generateVideoCreationPrompt,
};
