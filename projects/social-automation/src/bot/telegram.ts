/**
 * Telegram Bot Interface
 *
 * Control Claude Code and social automation from your phone.
 * Send commands via Telegram, get responses back.
 */

import { Telegraf, Context } from 'telegraf';
import { spawn } from 'child_process';

export interface TelegramBotConfig {
  token: string;
  allowedUsers: number[]; // Telegram user IDs that can use the bot
  claudePath?: string;
}

interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

export class ClaudeTelegramBot {
  private bot: Telegraf;
  private config: TelegramBotConfig;
  private activeSessions: Map<number, boolean> = new Map();

  constructor(config: TelegramBotConfig) {
    this.config = config;
    this.bot = new Telegraf(config.token);

    this.setupMiddleware();
    this.setupCommands();
  }

  /**
   * Middleware to check if user is authorized
   */
  private setupMiddleware(): void {
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;

      if (!userId || !this.config.allowedUsers.includes(userId)) {
        await ctx.reply('Unauthorized. Your user ID: ' + userId);
        return;
      }

      return next();
    });
  }

  /**
   * Set up bot commands
   */
  private setupCommands(): void {
    // Help command
    this.bot.command('help', async (ctx) => {
      await ctx.reply(`
*Claude Code Bot Commands:*

/claude <prompt> - Run Claude Code with a prompt
/status - Check system status
/tasks - List scheduled tasks
/post <platform> <content> - Schedule a post
/search <platform> <query> - Search for content
/cancel <taskId> - Cancel a scheduled task

*Examples:*
/claude Build a landing page for my app
/post reddit Check out my new project
/search twitter #buildinpublic
      `, { parse_mode: 'Markdown' });
    });

    // Run Claude Code
    this.bot.command('claude', async (ctx) => {
      const prompt = ctx.message.text.replace('/claude ', '').trim();

      if (!prompt) {
        await ctx.reply('Usage: /claude <your prompt>');
        return;
      }

      if (this.activeSessions.get(ctx.from!.id)) {
        await ctx.reply('A Claude session is already running. Please wait.');
        return;
      }

      this.activeSessions.set(ctx.from!.id, true);
      await ctx.reply('Starting Claude Code...');

      try {
        const result = await this.runClaude(prompt);

        // Split long messages
        const maxLength = 4000;
        const output = result.output || result.error || 'No output';

        for (let i = 0; i < output.length; i += maxLength) {
          await ctx.reply(output.slice(i, i + maxLength));
        }
      } catch (error) {
        await ctx.reply(`Error: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.activeSessions.delete(ctx.from!.id);
      }
    });

    // Status command
    this.bot.command('status', async (ctx) => {
      const uptime = process.uptime();
      const memory = process.memoryUsage();

      await ctx.reply(`
*System Status:*
- Uptime: ${Math.floor(uptime / 60)} minutes
- Memory: ${Math.round(memory.heapUsed / 1024 / 1024)}MB
- Active sessions: ${this.activeSessions.size}
      `, { parse_mode: 'Markdown' });
    });

    // Quick post command
    this.bot.command('post', async (ctx) => {
      const args = ctx.message.text.replace('/post ', '').trim().split(' ');
      const platform = args[0];
      const content = args.slice(1).join(' ');

      if (!platform || !content) {
        await ctx.reply('Usage: /post <reddit|twitter> <content>');
        return;
      }

      await ctx.reply(`Scheduling post to ${platform}:\n"${content}"\n\nUse /tasks to check status.`);
      // Would integrate with TaskScheduler here
    });

    // Handle plain text as Claude prompts
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;

      // Skip if it's a command
      if (text.startsWith('/')) return;

      // Treat as Claude prompt
      if (this.activeSessions.get(ctx.from!.id)) {
        await ctx.reply('A session is running. Please wait or use /cancel');
        return;
      }

      this.activeSessions.set(ctx.from!.id, true);
      await ctx.reply('Running...');

      try {
        const result = await this.runClaude(text);
        const output = result.output || result.error || 'No output';

        // Split long messages
        const maxLength = 4000;
        for (let i = 0; i < output.length; i += maxLength) {
          await ctx.reply(output.slice(i, i + maxLength));
        }
      } catch (error) {
        await ctx.reply(`Error: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.activeSessions.delete(ctx.from!.id);
      }
    });
  }

  /**
   * Run Claude Code with a prompt
   */
  private async runClaude(prompt: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      const claudePath = this.config.claudePath || 'claude';
      const args = ['-p', prompt, '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep'];

      let output = '';
      let error = '';

      const proc = spawn(claudePath, args, {
        timeout: 5 * 60 * 1000, // 5 minute timeout
      });

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        error += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          output: output.trim(),
          error: error.trim() || undefined,
        });
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          output: '',
          error: err.message,
        });
      });
    });
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    console.log('Starting Telegram bot...');

    this.bot.launch();

    // Graceful shutdown
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));

    console.log('Bot is running. Send messages to control Claude Code.');
  }
}

// Main entry point
async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUsers = process.env.TELEGRAM_ALLOWED_USERS?.split(',').map(Number) || [];

  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
  }

  if (allowedUsers.length === 0) {
    console.error('TELEGRAM_ALLOWED_USERS not set (comma-separated user IDs)');
    process.exit(1);
  }

  const bot = new ClaudeTelegramBot({
    token,
    allowedUsers,
  });

  await bot.start();
}

main().catch(console.error);
