/**
 * Purpose: Select the server AI chat client and optionally route through pi runtime with OpenAI-compatible fallback.
 */

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  createOpenAiCompatibleClient,
  type OpenAiCompatibleClient,
  type OpenAiCompatibleClientConfig,
  type OpenAiCompatibleCompletionInput,
  type OpenAiCompatibleCompletionResult,
  type OpenAiCompatibleLoggerEvent,
  type OpenAiCompatibleMessage,
} from '@shugu/ai-core';
import type { AiDebugLogger } from './ai-debug-logger.js';

type AiRuntimeMode = 'openai' | 'pi' | 'hybrid';
type JsonRecord = Record<string, unknown>;
type DynamicImport = (specifier: string) => Promise<unknown>;
type AiLogger = Pick<AiDebugLogger, 'write'> | undefined;

export type AiChatClientInput = {
  runtime?: AiRuntimeMode;
  openAiClient: OpenAiCompatibleClient;
  piClientLoader?: () => Promise<OpenAiCompatibleClient | null>;
};

type PiAiModule = {
  complete?: (model: unknown, context: unknown, options?: unknown) => Promise<unknown>;
  getModel?: (provider: string, model: string) => unknown;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const PI_LOCAL_DIST = '/Users/ziqi/Desktop/pi/packages/ai/dist/index.js';

const emptyUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const jsonParse = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const dynamicImport: DynamicImport = (specifier) =>
  Function('specifier', 'return import(specifier)')(specifier) as Promise<unknown>;

const runtimeFromEnv = (): AiRuntimeMode => {
  const raw = process.env.SHUGU_AI_RUNTIME?.trim().toLowerCase();
  return raw === 'pi' || raw === 'hybrid' || raw === 'openai' ? raw : 'openai';
};

const timeoutFromEnv = (): number => {
  const timeoutMs = Number(process.env.SHUGU_AI_OPENAI_TIMEOUT_MS);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
};

export const fallbackModelsFromEnv = (primaryModel: string): string[] => {
  const explicitRaw = process.env.SHUGU_AI_OPENAI_MODEL_FALLBACKS;
  if (explicitRaw !== undefined) {
    const explicit = explicitRaw.trim();
    if (!explicit) return [];
    return explicit
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => item !== primaryModel);
  }

  if (primaryModel === 'gpt-5.5') {
    return ['gpt-5.5-openai-compact', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.2'];
  }
  if (primaryModel === 'gpt-5.4') {
    return ['gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.2'];
  }
  if (primaryModel === 'gpt-5.3-codex') {
    return ['gpt-5.2'];
  }
  return [];
};

const createNoopAiClient = (): OpenAiCompatibleClient => ({
  describeConfig: () => ({
    baseUrl: '',
    model: 'disabled',
    apiKey: '[REDACTED]',
    supportsJsonSchema: true,
    timeoutMs: 0,
  }),
  completeJson: async (input) => ({
    raw: null,
    content: '',
    parsed: null,
    request: { url: '', body: { messages: input.messages } },
  }),
});

const createOpenAiClientFromEnv = (aiDebugLogger?: AiLogger): OpenAiCompatibleClient => {
  const apiKey = process.env.SHUGU_AI_OPENAI_API_KEY?.trim();
  const model = process.env.SHUGU_AI_OPENAI_MODEL?.trim() || 'gpt-5.5';
  const baseUrl = process.env.SHUGU_AI_OPENAI_BASE_URL?.trim() || 'https://code.b886.top/v1';
  const chatCompletionsUrl = process.env.SHUGU_AI_OPENAI_CHAT_COMPLETIONS_URL?.trim();
  if (!apiKey) return createNoopAiClient();
  const providerLogger = (event: OpenAiCompatibleLoggerEvent) =>
    aiDebugLogger?.write({ kind: 'ai.provider', providerEvent: event });

  const baseConfig: OpenAiCompatibleClientConfig = {
    apiKey,
    model,
    baseUrl,
    ...(chatCompletionsUrl ? { chatCompletionsUrl } : {}),
    timeoutMs: timeoutFromEnv(),
    logger: providerLogger,
  };

  return createFallbackAwareAiClient({
    primaryModel: model,
    fallbackModels: fallbackModelsFromEnv(model),
    createClient: (candidateModel) =>
      createOpenAiCompatibleClient({
        ...baseConfig,
        model: candidateModel,
      }),
    logger: aiDebugLogger,
  });
};

const piAiSpecifiersFromEnv = (): string[] => {
  const explicit = process.env.SHUGU_AI_PI_AI_SPECIFIER?.trim();
  if (explicit) return [explicit];

  const specifiers = ['@earendil-works/pi-ai'];
  if (existsSync(PI_LOCAL_DIST)) specifiers.push(pathToFileURL(PI_LOCAL_DIST).href);
  return specifiers;
};

const assistantContentText = (assistant: unknown): string => {
  if (!isRecord(assistant) || !Array.isArray(assistant.content)) return '';
  return assistant.content
    .map((item) => {
      if (!isRecord(item)) return '';
      if (item.type === 'text' && typeof item.text === 'string') return item.text;
      return '';
    })
    .join('');
};

const toPiMessages = (messages: OpenAiCompatibleMessage[]): JsonRecord[] => {
  const now = Date.now();
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => {
      if (message.role === 'assistant') {
        return {
          role: 'assistant',
          content: [{ type: 'text', text: message.content }],
          api: 'shugu-history',
          provider: 'shugu',
          model: 'history',
          usage: emptyUsage,
          stopReason: 'stop',
          timestamp: now,
        };
      }
      if (message.role === 'tool') {
        return {
          role: 'toolResult',
          toolCallId: 'shugu-tool-context',
          toolName: 'context',
          content: [{ type: 'text', text: message.content }],
          isError: false,
          timestamp: now,
        };
      }
      return { role: 'user', content: message.content, timestamp: now };
    });
};

export function createFallbackAwareAiClient(input: {
  primaryModel: string;
  fallbackModels: string[];
  createClient: (model: string) => OpenAiCompatibleClient;
  logger?: AiLogger;
}): OpenAiCompatibleClient {
  const models = [input.primaryModel, ...input.fallbackModels.filter((model) => model !== input.primaryModel)];
  const clients = models.map((model) => input.createClient(model));

  return {
    describeConfig: () => clients[0]?.describeConfig() ?? {
      baseUrl: '',
      model: input.primaryModel,
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 0,
    },
    completeJson: async <T = unknown>(
      completionInput: OpenAiCompatibleCompletionInput
    ): Promise<OpenAiCompatibleCompletionResult<T>> => {
      let lastCompletion: OpenAiCompatibleCompletionResult<T> | null = null;

      for (const [index, client] of clients.entries()) {
        const completion = await client.completeJson<T>(completionInput);
        lastCompletion = completion;
        if (completion.content.trim()) {
          if (index > 0) {
            input.logger?.write({
              kind: 'ai.provider.model.fallback.used',
              primaryModel: input.primaryModel,
              fallbackModel: models[index],
              attempt: index + 1,
            });
          }
          return completion;
        }

        if (index < clients.length - 1) {
          input.logger?.write({
            kind: 'ai.provider.model.fallback.empty',
            primaryModel: models[index],
            fallbackModel: models[index + 1],
            attempt: index + 1,
            request: completion.request,
          });
        }
      }

      return (
        lastCompletion ?? {
          raw: null,
          content: '',
          parsed: null,
          request: { url: '', body: { messages: completionInput.messages } },
        }
      );
    },
  };
}

async function importPiAi(importImpl: DynamicImport): Promise<PiAiModule | null> {
  for (const specifier of piAiSpecifiersFromEnv()) {
    try {
      const imported = await importImpl(specifier);
      if (isRecord(imported) && typeof imported.complete === 'function' && typeof imported.getModel === 'function') {
        return imported as PiAiModule;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function createPiRuntimeClient(input: {
  importImpl?: DynamicImport;
  logger?: AiLogger;
} = {}): Promise<OpenAiCompatibleClient | null> {
  const piAi = await importPiAi(input.importImpl ?? dynamicImport);
  if (!piAi?.complete || !piAi.getModel) {
    input.logger?.write({ kind: 'ai.runtime.pi.unavailable', reason: 'pi-ai module not found' });
    return null;
  }

  const provider = process.env.SHUGU_AI_PI_PROVIDER?.trim() || 'openai';
  const modelName =
    process.env.SHUGU_AI_PI_MODEL?.trim() || process.env.SHUGU_AI_OPENAI_MODEL?.trim() || 'gpt-5.5';
  const apiKey = process.env.SHUGU_AI_PI_API_KEY?.trim() || process.env.SHUGU_AI_OPENAI_API_KEY?.trim();
  const timeoutMs = timeoutFromEnv();
  const model = piAi.getModel(provider, modelName);

  return {
    describeConfig: () => ({
      baseUrl: `pi://${provider}`,
      model: modelName,
      apiKey: '[REDACTED]',
      supportsJsonSchema: false,
      timeoutMs,
    }),
    completeJson: async <T = unknown>(
      completionInput: OpenAiCompatibleCompletionInput
    ): Promise<OpenAiCompatibleCompletionResult<T>> => {
      const systemPrompt = completionInput.messages.find((message) => message.role === 'system')?.content;
      const context = {
        systemPrompt,
        messages: toPiMessages(completionInput.messages),
      };
      const raw = await piAi.complete!(model, context, {
        apiKey,
        temperature: completionInput.temperature,
        maxTokens: completionInput.maxTokens,
      });
      const content = assistantContentText(raw);
      return {
        raw,
        content,
        parsed: content ? jsonParse<T>(content) : null,
        request: {
          url: `pi://${provider}/complete`,
          body: {
            model: modelName,
            messages: completionInput.messages,
            responseFormat: completionInput.schema?.name,
          },
        },
      };
    },
  };
}

export async function createAiChatClient(input: AiChatClientInput): Promise<OpenAiCompatibleClient> {
  if (input.runtime === 'openai') return input.openAiClient;
  const piClient = await (input.piClientLoader?.() ?? Promise.resolve(null));
  return piClient ?? input.openAiClient;
}

export async function createConfiguredAiClient(aiDebugLogger?: AiLogger): Promise<OpenAiCompatibleClient> {
  const openAiClient = createOpenAiClientFromEnv(aiDebugLogger);
  return createAiChatClient({
    runtime: runtimeFromEnv(),
    openAiClient,
    piClientLoader: () => createPiRuntimeClient({ logger: aiDebugLogger }),
  });
}
