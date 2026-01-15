/**
 * Task Scheduler with Human-Like Patterns
 *
 * Schedules tasks with natural timing variations to avoid
 * detection as automated behavior.
 */

import { RateLimiter, RateLimitConfig } from './rate-limiter.js';

export interface ScheduledTask {
  id: string;
  type: string;
  payload: unknown;
  scheduledFor: number;
  priority: 'high' | 'normal' | 'low';
  retries: number;
  maxRetries: number;
  createdAt: number;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  executedAt: number;
  duration: number;
}

export type TaskExecutor = (task: ScheduledTask) => Promise<unknown>;

export interface SchedulerConfig {
  /** Check for tasks every N ms */
  pollInterval: number;
  /** Max concurrent tasks */
  maxConcurrent: number;
  /** Default rate limit config */
  defaultRateLimit: Partial<RateLimitConfig>;
  /** Timezone for scheduling */
  timezone?: string;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  pollInterval: 60 * 1000, // 1 minute
  maxConcurrent: 1,
  defaultRateLimit: {},
};

export class TaskScheduler {
  private config: SchedulerConfig;
  private tasks: Map<string, ScheduledTask> = new Map();
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private executors: Map<string, TaskExecutor> = new Map();
  private results: TaskResult[] = [];
  private running: boolean = false;
  private activeCount: number = 0;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a task executor for a task type
   */
  registerExecutor(taskType: string, executor: TaskExecutor, rateLimit?: Partial<RateLimitConfig>): void {
    this.executors.set(taskType, executor);
    this.rateLimiters.set(
      taskType,
      new RateLimiter({ ...this.config.defaultRateLimit, ...rateLimit })
    );
  }

  /**
   * Schedule a new task
   */
  schedule(
    type: string,
    payload: unknown,
    options: {
      delay?: number;
      scheduledFor?: number;
      priority?: 'high' | 'normal' | 'low';
      maxRetries?: number;
    } = {}
  ): string {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const task: ScheduledTask = {
      id,
      type,
      payload,
      scheduledFor: options.scheduledFor || Date.now() + (options.delay || 0),
      priority: options.priority || 'normal',
      retries: 0,
      maxRetries: options.maxRetries ?? 3,
      createdAt: Date.now(),
    };

    this.tasks.set(id, task);
    return id;
  }

  /**
   * Schedule multiple tasks with natural spacing
   */
  scheduleBatch(
    type: string,
    payloads: unknown[],
    options: {
      minSpacing?: number;
      maxSpacing?: number;
      startDelay?: number;
    } = {}
  ): string[] {
    const { minSpacing = 30 * 60 * 1000, maxSpacing = 120 * 60 * 1000, startDelay = 0 } = options;

    const ids: string[] = [];
    let cumulativeDelay = startDelay;

    for (const payload of payloads) {
      const id = this.schedule(type, payload, { delay: cumulativeDelay });
      ids.push(id);

      // Add random spacing for next task
      const spacing = minSpacing + Math.random() * (maxSpacing - minSpacing);
      cumulativeDelay += spacing;
    }

    return ids;
  }

  /**
   * Cancel a scheduled task
   */
  cancel(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  /**
   * Get tasks ready to execute
   */
  private getReadyTasks(): ScheduledTask[] {
    const now = Date.now();
    const ready: ScheduledTask[] = [];

    for (const task of this.tasks.values()) {
      if (task.scheduledFor <= now) {
        const limiter = this.rateLimiters.get(task.type);
        if (!limiter || limiter.canAct().allowed) {
          ready.push(task);
        }
      }
    }

    // Sort by priority and scheduled time
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    return ready.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.scheduledFor - b.scheduledFor;
    });
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: ScheduledTask): Promise<TaskResult> {
    const startTime = Date.now();
    const executor = this.executors.get(task.type);

    if (!executor) {
      return {
        taskId: task.id,
        success: false,
        error: `No executor registered for task type: ${task.type}`,
        executedAt: startTime,
        duration: 0,
      };
    }

    try {
      const result = await executor(task);

      // Record action with rate limiter
      const limiter = this.rateLimiters.get(task.type);
      if (limiter) limiter.recordAction();

      // Remove completed task
      this.tasks.delete(task.id);

      return {
        taskId: task.id,
        success: true,
        result,
        executedAt: startTime,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Retry logic
      if (task.retries < task.maxRetries) {
        task.retries++;
        // Exponential backoff: 5min, 15min, 45min
        const backoff = 5 * 60 * 1000 * Math.pow(3, task.retries - 1);
        task.scheduledFor = Date.now() + backoff;
        console.log(`Task ${task.id} failed, retry ${task.retries}/${task.maxRetries} in ${backoff / 1000}s`);
      } else {
        this.tasks.delete(task.id);
      }

      return {
        taskId: task.id,
        success: false,
        error: errorMsg,
        executedAt: startTime,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Process one tick of the scheduler
   */
  async tick(): Promise<TaskResult[]> {
    if (this.activeCount >= this.config.maxConcurrent) {
      return [];
    }

    const ready = this.getReadyTasks();
    const toExecute = ready.slice(0, this.config.maxConcurrent - this.activeCount);
    const results: TaskResult[] = [];

    for (const task of toExecute) {
      this.activeCount++;
      try {
        const result = await this.executeTask(task);
        results.push(result);
        this.results.push(result);
      } finally {
        this.activeCount--;
      }
    }

    return results;
  }

  /**
   * Start the scheduler loop
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    const loop = async () => {
      if (!this.running) return;

      try {
        await this.tick();
      } catch (error) {
        console.error('Scheduler tick error:', error);
      }

      setTimeout(loop, this.config.pollInterval);
    };

    loop();
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    running: boolean;
    pendingTasks: number;
    activeTasks: number;
    completedTasks: number;
    tasksByType: Record<string, number>;
  } {
    const tasksByType: Record<string, number> = {};
    for (const task of this.tasks.values()) {
      tasksByType[task.type] = (tasksByType[task.type] || 0) + 1;
    }

    return {
      running: this.running,
      pendingTasks: this.tasks.size,
      activeTasks: this.activeCount,
      completedTasks: this.results.length,
      tasksByType,
    };
  }

  /**
   * Get recent results
   */
  getResults(limit: number = 100): TaskResult[] {
    return this.results.slice(-limit);
  }
}
