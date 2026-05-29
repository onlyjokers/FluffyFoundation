/**
 * Purpose: Trim recent AI conversation messages with optional LangChain support and a tiny fallback.
 */

export type RecentConversationMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  id?: number | string;
};

export type RecentMessageTrimmerOptions = {
  maxChars?: number;
  importImpl?: (specifier: string) => Promise<unknown>;
};

const DEFAULT_MAX_CHARS = 12_000;

const dynamicImport = (specifier: string) =>
  Function('specifier', 'return import(specifier)')(specifier) as Promise<unknown>;

function messageChars(message: RecentConversationMessage): number {
  return Buffer.byteLength(message.content, 'utf8');
}

function fallbackTrim(messages: RecentConversationMessage[], maxChars: number): RecentConversationMessage[] {
  const kept: RecentConversationMessage[] = [];
  let total = 0;
  for (const message of [...messages].reverse()) {
    const chars = messageChars(message);
    if (kept.length > 0 && total + chars > maxChars) break;
    if (chars > maxChars) continue;
    kept.unshift(message);
    total += chars;
  }
  return kept;
}

export async function trimRecentConversationMessages(
  messages: RecentConversationMessage[],
  options: RecentMessageTrimmerOptions = {}
): Promise<RecentConversationMessage[]> {
  const maxChars = Math.max(1, Math.floor(options.maxChars ?? DEFAULT_MAX_CHARS));
  const importImpl = options.importImpl ?? dynamicImport;
  try {
    const imported = await importImpl('@langchain/core/messages');
    const trimMessages = imported && typeof imported === 'object' ? (imported as { trimMessages?: unknown }).trimMessages : null;
    if (typeof trimMessages === 'function') {
      return (await trimMessages(messages, {
        maxTokens: maxChars,
        tokenCounter: (items: RecentConversationMessage[]) =>
          items.reduce((total, item) => total + messageChars(item), 0),
        strategy: 'last',
      })) as RecentConversationMessage[];
    }
  } catch {
    // Optional dependency: fall through to the built-in character trimmer.
  }
  return fallbackTrim(messages, maxChars);
}
