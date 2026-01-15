# Claude Code Automation Instructions

This document contains instructions for running the ad creative automation pipeline with Claude Code.

## Quick Start

Run the full pipeline by providing this prompt to Claude Code:

```
Run the ad creative automation pipeline for [BRAND NAME].

Website: [WEBSITE URL]
Product: [PRODUCT/SERVICE]
Competitors: [COMPETITOR 1], [COMPETITOR 2], [COMPETITOR 3]

Execute all 5 steps:
1. Market research using web search and competitor analysis
2. Find niche keywords with high purchase intent
3. Deep dive into brand guidelines and positioning
4. Create customer avatars and generate headlines
5. Output 3 static ad variations and 2 UGC video scripts

Use the project structure at projects/ad-creative-automation for reference.
```

## Step-by-Step Execution

For more control, execute each step separately:

### Step 1: Market Research

```
Research the market for [BRAND].

Tasks:
- Analyze [COMPETITOR 1], [COMPETITOR 2], [COMPETITOR 3]
- Use web search to find their traffic estimates and top pages
- Check Meta Ad Library for their current ad examples
- Identify industry trends and seasonal patterns
- Find gaps in the market

Output as JSON matching MarketResearch interface in src/types.ts
```

### Step 2: Keyword Discovery

```
Find niche keywords for [BRAND] selling [PRODUCT].

Based on the market research above, discover:
- 20 primary keywords (commercial/transactional intent)
- 50 long-tail keywords (4+ words, very specific)
- 10 question keywords (how to, what is, etc.)
- Keyword gaps competitors are missing

Focus on terms that indicate buying readiness.
Output as JSON matching NicheKeywords interface.
```

### Step 3: Brand Analysis

```
Analyze [BRAND]'s brand identity.

Website: [URL]

Extract:
- Market positioning vs competitors
- Unique value proposition
- Tone of voice (analyze their website copy)
- Visual identity (colors, fonts, image style)
- Core messaging pillars
- Things to avoid (brand don'ts)

Output as JSON matching BrandAnalysis interface.
```

### Step 4: Customer Avatars & Headlines

```
Create customer avatars for [BRAND] based on:
- Keywords: [TOP KEYWORDS FROM STEP 2]
- Pain points identified: [PAIN POINTS]

For each avatar include demographics, psychographics, behaviors.

Then generate:
- 15-20 headlines using different frameworks (PAS, AIDA, curiosity, etc.)
- 5-7 visual concepts for the best headlines
```

### Step 5: Generate Ads

```
Create final ad specifications for [BRAND]:

3 Static Ads:
1. Problem-focused ad
2. Benefit-focused ad
3. Social proof ad

Each needs: headline, body, CTA, complete visual spec

2 UGC Videos:
1. Testimonial style (30s)
2. Problem-solution style (15s)

Each needs: hook, full script with timestamps, creator brief
```

## Integration with Manus + SimilarWeb

For enhanced research, use this prompt:

```
Use Manus to research [BRAND]'s market with SimilarWeb data:

1. Get 12 months of traffic history for [COMPETITOR URLs]
2. Benchmark against competitors
3. Analyze marketing channels and traffic sources
4. Get regional traffic breakdowns
5. Identify top performing pages and keywords

Then proceed with the ad creative pipeline using this data.
```

## Output Handling

After each step, save outputs to:
- `output/research.json`
- `output/keywords.json`
- `output/brand-analysis.json`
- `output/avatars.json`
- `output/ads-static.json`
- `output/ads-ugc.json`

Final compiled output: `output/campaign-creative.json`
