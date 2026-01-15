# TikTok Shop AI Content Factory

A fully automated system that repurposes, localizes, and launches winning TikTok Shop content across hundreds of creator-style accounts.

## Overview

This content factory implements the viral TikTok Shop strategy:

- **Manus** for product research and viral script ideas
- **Fastmoss/Cruva** for recently viral content from competitors
- **Nano Banana Pro** for UGC-style images
- **Kling 2.6 / Veo3** for AI video generation
- **Phone Posting Network** for automated multi-account posting
- **Multi-Platform Swarm (MPS)** for cross-platform deployment

## Tech Stack (~$300/month)

| Tool | Purpose | Cost |
|------|---------|------|
| Manus AI | Autonomous research | ~$50/mo |
| Fastmoss | Viral content discovery | ~$50/mo |
| Nano Banana Pro | Image generation | ~$30/mo |
| Kling 2.6 | Video generation | ~$100/mo |
| Phone Network | Multi-account posting | ~$50/mo |
| **Total** | | **~$280/mo** |

## Installation

```bash
# Clone the repository
cd projects/tiktok-shop-content-factory

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your API keys
```

## Quick Start

### Generate Master Prompt (Recommended Start)

```bash
# Generate full pipeline prompts for a product
npm run dev generate \
  --product "GlowPro LED Mask" \
  --category "beauty" \
  --niche "skincare" \
  --competitors "CurrentBody,Omnilux,Solawave" \
  --benefits "7 LED colors,FDA cleared,10 min daily" \
  --price 89.99 \
  --platforms "tiktok,instagram"
```

### Research Phase Only

```bash
# Generate viral content research prompt
npm run dev research \
  --niche "beauty" \
  --competitors "CurrentBody,Omnilux" \
  --keywords "LED mask,light therapy,skincare device"
```

### Product Research (Manus)

```bash
# Generate product research prompt for Manus AI
npm run dev product \
  --product "GlowPro LED Mask" \
  --category "beauty" \
  --market "women 25-45 skincare enthusiasts"
```

### Script Generation

```bash
# Generate viral script creation prompts
npm run dev scripts \
  --product "GlowPro LED Mask" \
  --category "beauty" \
  --benefits "7 LED colors,10 min treatment,professional results" \
  --count 10
```

### Account Setup

```bash
# Generate account setup instructions
npm run dev accounts \
  --niche "beauty" \
  --type "skincare devices" \
  --count 5 \
  --platform "tiktok"
```

### Content Briefs

```bash
# Generate content briefs
npm run dev briefs \
  --product "GlowPro LED Mask" \
  --category "beauty" \
  --count 5 \
  --platforms "tiktok,instagram"
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTENT FACTORY PIPELINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   RESEARCH   │───▶│   CONTENT    │───▶│    VIDEO     │       │
│  │              │    │  GENERATION  │    │  GENERATION  │       │
│  │  • Manus     │    │              │    │              │       │
│  │  • Fastmoss  │    │  • Scripts   │    │  • Kling 2.6 │       │
│  │  • Cruva     │    │  • Images    │    │  • Veo3      │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                   ACCOUNT NETWORK                     │       │
│  │                                                       │       │
│  │    @account1    @account2    @account3    @account4  │       │
│  │        │            │            │            │       │       │
│  └────────┼────────────┼────────────┼────────────┼──────┘       │
│           │            │            │            │                │
│           ▼            ▼            ▼            ▼                │
│  ┌──────────────────────────────────────────────────────┐       │
│  │              POSTING SCHEDULER                        │       │
│  │         Daily automated posting queue                 │       │
│  └──────────────────────────────────────────────────────┘       │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────┐       │
│  │          MULTI-PLATFORM SWARM (MPS)                   │       │
│  │                                                       │       │
│  │   TikTok ──▶ Instagram ──▶ YouTube ──▶ Facebook      │       │
│  │      │           │            │           │           │       │
│  │      └───────────┴────────────┴───────────┘           │       │
│  │                      │                                │       │
│  │                      ▼                                │       │
│  │             TikTok Shop + Amazon                      │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Modules

### 1. Research (`src/research/`)

- **Viral Content Scraper**: Fastmoss/Cruva integration for viral content discovery
- **Product Research**: Manus AI integration for autonomous product analysis
- **Hook Analysis**: Pattern detection from successful content

### 2. Content Generation (`src/content/`)

- **Script Generator**: 8 proven viral frameworks (PAS, AIDA, BAB, etc.)
- **Hook Generator**: 7 hook types with platform optimization
- **Image Generator**: Nano Banana integration for UGC-style images

### 3. Video Generation (`src/video/`)

- **Kling 2.6 Integration**: High-quality AI video generation
- **Veo3 Integration**: Google's video AI for realistic content
- **Batch Processing**: Generate multiple videos in parallel

### 4. Account Management (`src/accounts/`)

- **Profile Generator**: 8 creator persona templates
- **Batch Creation**: Generate multiple accounts at once
- **Schedule Management**: Optimal posting times per persona

### 5. Posting Automation (`src/posting/`)

- **Smart Scheduler**: Platform-optimized posting times
- **Queue Management**: Multi-account posting coordination
- **Phone Network Setup**: Distributed posting infrastructure

### 6. Multi-Platform Swarm (`src/swarm/`)

- **Variation Generator**: Hook and caption variations
- **Cross-Platform Deployment**: Simultaneous multi-platform posting
- **Traffic Consolidation**: Drive all traffic to TikTok Shop/Amazon

## Workflow

### Daily Operations

```
Morning (6-8 AM)
├── Check account health
├── Review overnight metrics
└── Clear posting queue issues

Midday (12-1 PM)
├── Monitor morning performance
├── Engage with comments
└── Adjust afternoon schedule

Evening (6-8 PM)
├── Review day's performance
├── Queue tomorrow's content
└── Document top performers

Weekly
├── Calculate total GMV
├── Optimize underperformers
├── Plan next week's content
└── Update script variations
```

### Content Production Flow

1. **Research**: Find viral content in your niche
2. **Analysis**: Extract hooks, scripts, visual patterns
3. **Brief Generation**: Create content briefs inspired by winners
4. **Image Generation**: Generate UGC-style images
5. **Video Generation**: Create AI videos from images
6. **Scheduling**: Queue posts across accounts
7. **Deployment**: Automated posting with variations
8. **Swarm**: Deploy to multiple platforms

## Script Frameworks

The system includes 8 proven viral script frameworks:

| Framework | Best For | Structure |
|-----------|----------|-----------|
| PAS | Pain-point products | Problem → Agitate → Solution |
| AIDA | Aspirational products | Attention → Interest → Desire → Action |
| BAB | Transformations | Before → After → Bridge |
| STORY | Emotional products | Setup → Conflict → Resolution |
| DEMO | Gadgets/tools | Hook → Problem → Demo → Results |
| SOCIAL_PROOF | Trending products | Viral claim → Proof → Recommendation |
| CURIOSITY | Unique products | Mystery → Tension → Reveal |
| COMPARISON | Alternatives | Option A → Option B → Verdict |

## Hook Types

7 proven hook patterns with effectiveness ratings:

- **Transformation** (92%) - Before/after content
- **Controversy** (90%) - Unpopular opinions
- **Curiosity** (88%) - Information gaps
- **Pain-Point** (87%) - Problem acknowledgment
- **Social-Proof** (85%) - Viral/trending claims
- **Question** (82%) - Audience engagement
- **Statement** (75%) - Direct claims

## Creator Personas

8 ready-to-use creator persona templates:

- Fitness Enthusiast
- Skincare Lover
- Home Organizer
- Tech Reviewer
- Fashion Finder
- Mom Life
- Pet Parent
- Foodie

## Configuration

### Example Campaign Config

```json
{
  "product": {
    "name": "GlowPro LED Face Mask",
    "category": "beauty",
    "price": 89.99,
    "keyBenefits": ["7 LED colors", "FDA cleared", "10 min daily"],
    "tiktokShopUrl": "https://shop.tiktok.com/...",
    "amazonUrl": "https://amazon.com/..."
  },
  "niche": "beauty",
  "competitors": ["CurrentBody", "Omnilux"],
  "platforms": ["tiktok", "instagram", "youtube-shorts"],
  "dailyPostTarget": 3,
  "contentStyle": "mixed"
}
```

## API Integrations

The system is designed to integrate with:

- **Fastmoss**: Viral TikTok content discovery
- **Cruva**: Competitor content analysis
- **Manus AI**: Autonomous research tasks
- **Nano Banana Pro**: UGC image generation
- **Kling 2.6**: AI video generation
- **Google Veo3**: Alternative video generation
- **TikTok API**: Direct posting (when available)

## Output

The system generates:

1. **Master Prompt**: Complete pipeline instructions for Claude/AI execution
2. **Content Briefs**: Detailed scripts with visual/audio direction
3. **Image Prompts**: Optimized prompts for image generation
4. **Video Prompts**: Platform-specific video generation prompts
5. **Account Setup**: Step-by-step account creation guides
6. **Posting Schedules**: Optimized posting calendars
7. **Swarm Deployment**: Multi-platform distribution plans

## Best Practices

### Content Quality
- Maintain authentic UGC aesthetic
- Avoid overly polished/commercial look
- Focus on genuine reactions and demonstrations
- Use natural lighting and casual settings

### Account Health
- Maximum 3 accounts per phone/IP
- 4+ hours between posts per account
- 30%+ original content per account
- Regular engagement with comments

### Scaling
- Start with 3-5 accounts
- Scale based on GMV performance
- Rotate underperforming accounts
- Test new niches with 1 account first

## License

MIT

## Contributing

Contributions welcome! Please read the contributing guidelines first.
