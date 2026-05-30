/**
 * Purpose: Build and budget AI prompt blocks before sending model requests.
 */

export type AiPromptBlockPriority = 'must' | 'high' | 'medium' | 'low';

export type AiPromptBlock = {
  id: string;
  role: 'system' | 'user';
  priority: AiPromptBlockPriority;
  content: string | Record<string, unknown>;
};

export type AiContextBudgetOptions = {
  maxChars?: number;
};

export type AiContextBudgetDroppedBlock = {
  id: string;
  chars: number;
};

export type AiContextBudgetResult = {
  blocks: AiPromptBlock[];
  dropped: AiContextBudgetDroppedBlock[];
  totalChars: number;
};

const DEFAULT_MAX_CHARS = 50_000;
const priorityRank: Record<AiPromptBlockPriority, number> = {
  must: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function promptBlockContent(block: Pick<AiPromptBlock, 'content'>): string {
  return typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
}

function blockChars(block: AiPromptBlock): number {
  return Buffer.byteLength(promptBlockContent(block), 'utf8');
}

function blocksChars(blocks: AiPromptBlock[]): number {
  return blocks.reduce((total, block) => total + blockChars(block), 0);
}

function compressionNotice(dropped: AiContextBudgetDroppedBlock[]): AiPromptBlock {
  return {
    id: 'compressionNotice',
    role: 'user',
    priority: 'must',
    content: {
      kind: 'compressionNotice',
      dropped: dropped.map((item) => item.id),
      rules: [
        'Do not infer missing node ids, ports, params, or policy.',
        'Return a safe no-op plan if the remaining context is insufficient.',
      ],
    },
  };
}

export function applyAiContextBudget(
  blocks: AiPromptBlock[],
  options: AiContextBudgetOptions = {}
): AiContextBudgetResult {
  const maxChars = Math.max(1, Math.floor(options.maxChars ?? DEFAULT_MAX_CHARS));
  const kept = [...blocks];
  const dropped: AiContextBudgetDroppedBlock[] = [];

  const removable = [...kept]
    .map((block, index) => ({ block, index }))
    .filter((item) => item.block.priority !== 'must')
    .sort((a, b) => priorityRank[b.block.priority] - priorityRank[a.block.priority] || b.index - a.index);

  for (const { block } of removable) {
    if (blocksChars(kept) <= maxChars) break;
    const index = kept.findIndex((item) => item.id === block.id);
    if (index < 0) continue;
    dropped.push({ id: block.id, chars: blockChars(block) });
    kept.splice(index, 1);
  }

  if (dropped.length > 0) {
    kept.push(compressionNotice(dropped));
  }

  while (blocksChars(kept) > maxChars) {
    const index = kept.findIndex((block) => block.id === 'compressionNotice');
    if (index < 0) break;
    const [removed] = kept.splice(index, 1);
    if (removed) dropped.push({ id: removed.id, chars: blockChars(removed) });
  }

  return { blocks: kept, dropped, totalChars: blocksChars(kept) };
}

export function buildPromptMessagesFromBlocks(
  blocks: AiPromptBlock[]
): Array<{ role: 'system' | 'user'; content: string }> {
  return blocks.map((block) => ({
    role: block.role,
    content: promptBlockContent(block),
  }));
}
