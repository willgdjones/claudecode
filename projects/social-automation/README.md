# Social Automation

Sustainable social media automation with human-like patterns. Control from your phone via Telegram.

## Features

- **Rate Limiting** - Built-in limits that mimic human behavior
- **Platform Connectors** - Reddit, Twitter/X with official APIs
- **Social Monitor** - Track mentions, keywords, opportunities
- **Task Scheduler** - Queue posts with natural timing
- **Telegram Bot** - Control everything from your phone

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Run the Telegram bot
npm run bot

# Or run the monitor
npm run monitor
```

## Project Structure

```
social-automation/
├── src/
│   ├── platforms/
│   │   ├── reddit.ts      # Reddit API connector
│   │   └── twitter.ts     # Twitter API connector
│   ├── bot/
│   │   └── telegram.ts    # Telegram bot for mobile control
│   ├── monitor/
│   │   └── index.ts       # Social mention monitoring
│   └── index.ts           # Main orchestrator
└── config/
```

## Configuration

### Environment Variables

```bash
# Reddit
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USERNAME=your_username
REDDIT_PASSWORD=your_password

# Twitter
TWITTER_APP_KEY=your_app_key
TWITTER_APP_SECRET=your_app_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_ALLOWED_USERS=123456789,987654321
```

## Rate Limits

Built-in sustainable limits:

| Platform | Action | Limit | Spacing |
|----------|--------|-------|---------|
| Reddit | Post | 2/day | 4-8 hours |
| Reddit | Comment | 10/hour | 5-15 min |
| Twitter | Tweet | 5/day | 2-6 hours |
| Twitter | Reply | 20/day | 30-90 min |

All actions include:
- Random jitter (not exactly on schedule)
- Active hours (only post when humans are awake)
- Warmup period (reduced activity for new accounts)

## Telegram Bot Commands

Control Claude Code from your phone:

```
/claude <prompt>  - Run Claude Code
/status           - System status
/post reddit <content> - Schedule Reddit post
/search twitter <query> - Search Twitter
```

Or just send any message - it's treated as a Claude prompt.

## Usage Examples

### Schedule Posts with Natural Spacing

```typescript
import { SocialAutomation } from 'social-automation';

const auto = new SocialAutomation({
  reddit: { /* config */ },
  twitter: { /* config */ },
});

// Schedule a week of content
const posts = [
  'Launched my new feature today!',
  'Here's what I learned building X...',
  'Quick tip for fellow founders...',
];

// Auto-spaces with 4-8 hour gaps
auto.scheduler.scheduleBatch('twitter-tweet',
  posts.map(text => ({ text })),
  { minSpacing: 4 * 60 * 60 * 1000 }
);

auto.start();
```

### Monitor for Opportunities

```typescript
const auto = new SocialAutomation({
  reddit: { /* config */ },
  monitor: {
    keywords: ['looking for', 'recommendations', 'your-product'],
    subreddits: ['startups', 'SideProject'],
    twitterQueries: ['#buildinpublic your-niche'],
    pollInterval: 5 * 60 * 1000, // 5 min
  },
  onMatch: (match) => {
    console.log(`Found opportunity: ${match.url}`);
    // Send to Telegram, add to queue, etc.
  },
});

auto.start();
```

## Integration with Other Projects

This project uses `@projects/shared` for rate limiting and scheduling.
Other projects in this repo can import these utilities:

```typescript
import { RateLimiter, TaskScheduler } from '@projects/shared';
```

## VPS Deployment

For 24/7 operation, deploy to a cheap VPS:

```bash
# On your VPS (Hetzner, DigitalOcean, etc.)
git clone <repo>
cd projects/social-automation
npm install
npm run bot  # Or use PM2 for persistence
```

See parent README for VibeOps setup instructions.

## License

MIT
