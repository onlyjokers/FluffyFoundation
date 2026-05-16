/**
 * Purpose: Optional server-side JSONL debug logging for AI agent turns and related gateway events.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type AiDebugLogRecord = {
  kind: string;
  timestamp?: string;
  [key: string]: unknown;
};

export type AiDebugLoggerConfig = {
  enabled?: boolean;
  logDir?: string;
  includePrompts?: boolean;
  maxFieldChars?: number;
  now?: () => Date;
};

const DEFAULT_MAX_FIELD_CHARS = 200_000;
const SECRET_KEYS = new Set([
  'apiKey',
  'api_key',
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
  'password',
  'secret',
  'token',
]);

const trueValues = new Set(['1', 'true', 'yes', 'on']);
const falseValues = new Set(['0', 'false', 'no', 'off']);

function flagFromEnv(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (trueValues.has(normalized)) return true;
  if (falseValues.has(normalized)) return false;
  return fallback;
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultLogDir(): string {
  return join(process.cwd(), 'logs', 'ai-agent');
}

function serializeError(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause !== undefined ? { cause: sanitizeValue(error.cause, {}) } : {}),
  };
}

function truncateString(value: string, maxFieldChars: number): string {
  if (value.length <= maxFieldChars) return value;
  return `${value.slice(0, maxFieldChars)}...[truncated ${value.length - maxFieldChars} chars]`;
}

function sanitizeValue(
  value: unknown,
  options: { includePrompts?: boolean; maxFieldChars?: number; key?: string; seen?: WeakSet<object> }
): unknown {
  const maxFieldChars = options.maxFieldChars ?? DEFAULT_MAX_FIELD_CHARS;
  const key = options.key ?? '';

  if (SECRET_KEYS.has(key)) return '[REDACTED]';
  if (
    options.includePrompts === false &&
    (key === 'messages' || key === 'prompt' || key === 'promptPayload')
  ) {
    return '[PROMPT_LOGGING_DISABLED]';
  }
  if (typeof value === 'string') return truncateString(value, maxFieldChars);
  if (typeof value !== 'object' || value === null) return value;
  if (value instanceof Error) return serializeError(value);

  const seen = options.seen ?? new WeakSet<object>();
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeValue(item, {
        includePrompts: options.includePrompts,
        maxFieldChars,
        seen,
      })
    );
  }

  const out: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    out[entryKey] = sanitizeValue(entryValue, {
      includePrompts: options.includePrompts,
      maxFieldChars,
      key: entryKey,
      seen,
    });
  }
  return out;
}

function configFromEnv(): Required<Pick<AiDebugLoggerConfig, 'enabled' | 'logDir' | 'includePrompts' | 'maxFieldChars'>> {
  return {
    enabled: flagFromEnv(process.env.SHUGU_AI_DEBUG_LOG, false),
    logDir: process.env.SHUGU_AI_DEBUG_LOG_DIR?.trim() || defaultLogDir(),
    includePrompts: flagFromEnv(process.env.SHUGU_AI_DEBUG_LOG_PROMPTS, true),
    maxFieldChars: numberFromEnv(process.env.SHUGU_AI_DEBUG_LOG_MAX_FIELD_CHARS, DEFAULT_MAX_FIELD_CHARS),
  };
}

export class AiDebugLogger {
  private readonly enabled: boolean;
  private readonly logDir: string;
  private readonly includePrompts: boolean;
  private readonly maxFieldChars: number;
  private readonly now: () => Date;

  constructor(config: AiDebugLoggerConfig = configFromEnv()) {
    this.enabled = Boolean(config.enabled);
    this.logDir = config.logDir ?? defaultLogDir();
    this.includePrompts = config.includePrompts ?? true;
    this.maxFieldChars = config.maxFieldChars ?? DEFAULT_MAX_FIELD_CHARS;
    this.now = config.now ?? (() => new Date());
    if (this.enabled) {
      this.write({
        kind: 'ai.debug.logger.ready',
        enabled: this.enabled,
        logDir: this.logDir,
        includePrompts: this.includePrompts,
        maxFieldChars: this.maxFieldChars,
      });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  write(record: AiDebugLogRecord): void {
    if (!this.enabled) return;

    const timestamp = this.now().toISOString();
    const sanitized = sanitizeValue(
      {
        timestamp,
        ...record,
      },
      {
        includePrompts: this.includePrompts,
        maxFieldChars: this.maxFieldChars,
      }
    );

    mkdirSync(this.logDir, { recursive: true });
    const date = timestamp.slice(0, 10);
    appendFileSync(
      join(this.logDir, `ai-agent-debug-${date}.jsonl`),
      `${JSON.stringify(sanitized)}\n`,
      'utf8'
    );
  }
}

export function createAiDebugLogger(config?: AiDebugLoggerConfig): AiDebugLogger {
  return new AiDebugLogger(config);
}

export function createAiDebugLoggerFromEnv(): AiDebugLogger {
  return createAiDebugLogger(configFromEnv());
}
