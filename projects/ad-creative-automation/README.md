# Ad Creative Automation Pipeline

Automated ad creative generation using Claude Code with market research integrations.

## Overview

This pipeline automates the creation of ad creatives through a 5-step process:

1. **Market Research** - Competitor analysis using SimilarWeb integration
2. **Keyword Discovery** - Find niche, high-intent search terms
3. **Brand Deep Dive** - Analyze brand guidelines and positioning
4. **Creative Strategy** - Develop customer avatars, headlines, and visuals
5. **Ad Generation** - Output 3 static ads + 2 UGC video scripts

## Project Structure

```
ad-creative-automation/
├── src/
│   ├── research/          # Market research module (SimilarWeb)
│   ├── keywords/          # Niche keyword discovery
│   ├── brand/             # Brand analysis module
│   ├── creative/          # Avatars and headlines
│   ├── output/            # Ad generation
│   ├── types.ts           # TypeScript interfaces
│   ├── index.ts           # Main pipeline orchestrator
│   └── cli.ts             # Command-line interface
├── config/                # Campaign configurations
├── prompts/               # Claude Code prompts
│   └── CLAUDE.md          # Step-by-step automation guide
└── examples/              # Example outputs
```

## Usage

### With Claude Code

The primary use case is running this pipeline with Claude Code. See `prompts/CLAUDE.md` for detailed instructions.

Quick start:
```
Run the ad creative automation pipeline for [BRAND NAME].
Website: [URL]
Execute all 5 steps and output 3 static ads + 2 UGC videos.
```

### CLI Commands

```bash
# Install dependencies
npm install

# Generate master prompt for a campaign
npm run generate -- -b "Brand Name" -w "https://example.com" -c "competitor1,competitor2"

# Generate research-only prompt
npm run research -- -b "Brand Name" -w "https://example.com"

# Generate brand analysis prompt
npm run analyze -- -b "Brand Name" -w "https://example.com"
```

## Pipeline Steps

### Step 1: Market Research

Integrates with SimilarWeb (via Manus) to gather:
- 12 months of traffic history
- Competitor benchmarks
- Marketing channel analysis
- Regional traffic breakdowns

### Step 2: Niche Keyword Discovery

Finds high-value keywords that competitors miss:
- Long-tail keywords with purchase intent
- Question-based queries
- Keyword gaps in the market

### Step 3: Brand Deep Dive

Analyzes brand identity for creative alignment:
- Market positioning
- Tone of voice
- Visual identity
- Messaging pillars

### Step 4: Creative Development

Creates customer avatars and generates:
- 15-20 headlines using proven frameworks
- 5-7 visual concepts
- Matched to specific avatar segments

### Step 5: Ad Output

Generates production-ready specifications:
- 3 static ad variations (problem, benefit, social proof)
- 2 UGC video scripts with creator briefs

## Output Format

Final output includes:
- Complete ad specifications
- Visual direction briefs
- Video scripts with timestamps
- Creator casting/production briefs

## Integration Points

- **Manus AI** - Autonomous research tasks
- **SimilarWeb** - Web traffic and competitor data
- **Meta Ad Library** - Competitor ad examples
- **Nano Banana** - Video script structuring

## Configuration

Create a campaign config in `config/`:

```json
{
  "brand": {
    "name": "Your Brand",
    "website": "https://yourbrand.com",
    "description": "What you do",
    "tone": "Professional, approachable",
    "colors": ["#hex1", "#hex2"]
  },
  "product": "Your Product",
  "goal": "conversion",
  "competitors": ["comp1.com", "comp2.com"],
  "platforms": ["meta", "google"]
}
```

## License

MIT
