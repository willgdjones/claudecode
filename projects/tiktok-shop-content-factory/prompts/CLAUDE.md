# Claude Code Automation Guide

This document describes how to use Claude Code to automate the TikTok Shop Content Factory pipeline.

## Quick Start

### 1. Generate Master Prompt

```bash
npm run dev generate \
  --product "Your Product Name" \
  --category "your-category" \
  --niche "your-niche" \
  --competitors "Comp1,Comp2,Comp3"
```

### 2. Feed to Claude

Copy the generated master prompt and ask Claude to execute each phase:

```
Execute the following TikTok Shop Content Factory pipeline:

[PASTE MASTER PROMPT HERE]

Start with Phase 1: Research
```

## Phase-by-Phase Execution

### Phase 1: Research

Ask Claude:
```
Based on the research prompt, search for viral TikTok Shop content in the [NICHE] niche.

Find:
1. Top 20 viral videos with >100k views
2. Hook patterns that work
3. Script structures
4. Trending sounds
5. Competitor strategies

Output as structured JSON.
```

### Phase 2: Script Generation

Ask Claude:
```
Using the research data, generate 10 viral scripts for [PRODUCT].

For each script:
1. Choose a framework (PAS, AIDA, BAB, etc.)
2. Write the hook (3 seconds)
3. Write the body (20-25 seconds)
4. Write the CTA (3-5 seconds)
5. Add visual direction
6. Add sound direction
7. Add hashtags
```

### Phase 3: Image Generation

Ask Claude:
```
Generate Nano Banana prompts for each script's key frames:

1. Hook frame (attention grabber)
2. Problem frame (pain point visual)
3. Solution frame (product introduction)
4. Demo frames (product in action)
5. Result frame (happy outcome)
6. CTA frame (call to action)

Use UGC style: iPhone quality, natural lighting, authentic feel.
```

### Phase 4: Video Generation

Ask Claude:
```
Generate Kling 2.6 prompts for each content brief:

1. Full video prompt (30 seconds)
2. Segment prompts if needed
3. Motion and camera directions
4. Style specifications (UGC, authentic)

Format for direct API input.
```

### Phase 5: Account Setup

Ask Claude:
```
Generate account setup instructions for [COUNT] TikTok accounts:

1. Creator personas (from templates)
2. Bio templates
3. Profile optimization
4. TikTok Shop linking steps
5. Affiliate application templates
```

### Phase 6: Scheduling

Ask Claude:
```
Create a 7-day posting schedule for [COUNT] accounts:

1. Optimal posting times by niche
2. Content rotation strategy
3. Hashtag variations
4. Caption variations
5. Product link placement
```

### Phase 7: Swarm Deployment

Ask Claude:
```
Plan multi-platform deployment:

1. Platform-specific adaptations
2. Hook variations per platform
3. Caption optimizations
4. Link strategies
5. Deployment timeline
```

## Automation Tips

### For Research
- Use web search to find actual viral TikTok content
- Extract real engagement metrics
- Note actual trending sounds

### For Content
- Generate multiple variations per brief
- Include specific product details
- Match tone to target audience

### For Images
- Be specific about UGC aesthetic
- Include lighting and setting details
- Specify expressions and poses

### For Videos
- Keep prompts concise but detailed
- Specify motion amount
- Include camera direction

### For Accounts
- Vary personas across accounts
- Use realistic bio styles
- Plan engagement strategies

### For Scheduling
- Account for time zones
- Avoid identical posting times
- Space content appropriately

## Output Storage

Save Claude's outputs to:

```
output/
├── research/
│   ├── viral-videos.json
│   └── competitor-analysis.json
├── content/
│   ├── briefs/
│   │   ├── brief-001.json
│   │   └── brief-002.json
│   ├── scripts/
│   └── prompts/
├── accounts/
│   └── profiles.json
└── schedule/
    └── calendar.json
```

## Integration with External Tools

### Nano Banana
```
Take the image prompts and:
1. Open Nano Banana Pro
2. Paste each prompt
3. Generate images
4. Download and organize by brief ID
```

### Kling 2.6
```
Take the video prompts and:
1. Open Kling AI
2. Upload reference images
3. Paste video prompt
4. Generate and download
```

### Posting
```
For each scheduled post:
1. Open TikTok on designated phone
2. Upload video
3. Paste caption
4. Add product tags
5. Post at scheduled time
```

## Error Handling

If Claude encounters issues:

1. **Research fails**: Try different search terms or time ranges
2. **Scripts feel generic**: Add more product-specific details
3. **Images don't match**: Adjust style modifiers
4. **Videos too short**: Increase duration or segment count
5. **Scheduling conflicts**: Spread posts further apart

## Performance Optimization

### Batch Processing
- Generate multiple scripts at once
- Process all images in one session
- Schedule multiple videos per run

### Iteration
- Test hooks with quick videos first
- Scale winners across accounts
- Retire underperformers quickly

### Tracking
- Log all generated content
- Track performance metrics
- Document winning patterns

## Example Full Session

```
Human: I want to create a TikTok Shop content factory for my LED face mask product.

Claude: I'll help you build a complete content factory. Let me start by generating the master prompt...

[Runs: npm run dev generate --product "GlowPro LED Mask" --category "beauty" ...]

Now let me execute Phase 1: Research...

[Searches for viral LED mask content, analyzes competitors...]

Research complete. Moving to Phase 2: Script Generation...

[Generates 10 viral scripts using different frameworks...]

Scripts ready. Shall I proceed with image prompt generation?