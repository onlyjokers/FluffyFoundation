/**
 * Purpose: Provide bounded advisory durable memory for AI Agent prompt context.
 */

export type AiDurableMemoryItem = {
  id?: string;
  text: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

export type AiDurableMemorySnapshot = {
  kind: 'durableMemory';
  source: string;
  authority: 'advisory';
  enabled: boolean;
  items: AiDurableMemoryItem[];
  error?: string;
};

export type AiDurableMemoryProvider = {
  search(input: { targetSpaceId: string; query: string; limit: number }): Promise<AiDurableMemoryItem[]>;
  add(input: { targetSpaceId: string; text: string; metadata?: Record<string, unknown> }): Promise<void>;
};

export type AiDurableMemory = {
  recall(input: { targetSpaceId: string; query: string }): Promise<AiDurableMemorySnapshot>;
  remember(input: { targetSpaceId: string; text: string; metadata?: Record<string, unknown> }): Promise<void>;
};

export type AiDurableMemoryOptions = {
  provider?: AiDurableMemoryProvider | null;
  source?: string;
  recallLimit?: number;
  itemMaxChars?: number;
};

type DynamicImport = (specifier: string) => Promise<unknown>;
type Mem0MemoryLike = {
  search?: (query: string, options?: Record<string, unknown>) => Promise<unknown>;
  add?: (text: string, options?: Record<string, unknown>) => Promise<unknown>;
};

const DEFAULT_RECALL_LIMIT = 5;
const DEFAULT_ITEM_MAX_CHARS = 800;

function boundedNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : fallback;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const suffix = '...[truncated]';
  if (maxChars <= suffix.length) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - suffix.length)}${suffix}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const dynamicImport: DynamicImport = (specifier) =>
  Function('specifier', 'return import(specifier)')(specifier) as Promise<unknown>;

function normalizeMem0Results(results: unknown): AiDurableMemoryItem[] {
  const list = Array.isArray(results)
    ? results
    : isRecord(results) && Array.isArray(results.results)
      ? results.results
      : [];
  return list.flatMap((item, index) => {
    if (typeof item === 'string') return [{ id: `mem0:${index}`, text: item }];
    if (!isRecord(item)) return [];
    const text =
      typeof item.memory === 'string'
        ? item.memory
        : typeof item.text === 'string'
          ? item.text
          : typeof item.content === 'string'
            ? item.content
            : '';
    if (!text) return [];
    return [
      {
        id: typeof item.id === 'string' ? item.id : `mem0:${index}`,
        text,
        score: typeof item.score === 'number' ? item.score : undefined,
        metadata: isRecord(item.metadata) ? item.metadata : undefined,
      },
    ];
  });
}

export async function createMem0DurableMemoryProvider(
  importImpl: DynamicImport = dynamicImport
): Promise<AiDurableMemoryProvider | null> {
  try {
    const imported = await importImpl('mem0ai/oss');
    const MemoryCtor = isRecord(imported) ? imported.Memory : undefined;
    if (typeof MemoryCtor !== 'function') return null;
    const memory = new (MemoryCtor as new () => Mem0MemoryLike)();
    if (typeof memory.search !== 'function' || typeof memory.add !== 'function') return null;
    return {
      search: async ({ targetSpaceId, query, limit }) =>
        normalizeMem0Results(
          await memory.search!(query, {
            user_id: targetSpaceId,
            limit,
          })
        ),
      add: async ({ targetSpaceId, text, metadata }) => {
        await memory.add!(text, {
          user_id: targetSpaceId,
          metadata,
        });
      },
    };
  } catch {
    return null;
  }
}

export function createAiDurableMemory(options: AiDurableMemoryOptions = {}): AiDurableMemory {
  const provider = options.provider ?? null;
  const source = options.source ?? 'mem0';
  const recallLimit = boundedNumber(options.recallLimit, DEFAULT_RECALL_LIMIT);
  const itemMaxChars = boundedNumber(options.itemMaxChars, DEFAULT_ITEM_MAX_CHARS);

  return {
    async recall(input) {
      if (!provider) {
        return { kind: 'durableMemory', source, authority: 'advisory', enabled: false, items: [] };
      }
      try {
        const items = await provider.search({
          targetSpaceId: input.targetSpaceId,
          query: input.query,
          limit: recallLimit,
        });
        return {
          kind: 'durableMemory',
          source,
          authority: 'advisory',
          enabled: true,
          items: items.slice(0, recallLimit).map((item) => ({
            ...item,
            text: truncate(item.text, itemMaxChars),
          })),
        };
      } catch (error) {
        return {
          kind: 'durableMemory',
          source,
          authority: 'advisory',
          enabled: false,
          items: [],
          error: errorMessage(error),
        };
      }
    },
    async remember(input) {
      if (!provider) return;
      await provider.add({
        targetSpaceId: input.targetSpaceId,
        text: truncate(input.text, itemMaxChars),
        metadata: input.metadata,
      });
    },
  };
}
