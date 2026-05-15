/**
 * Purpose: Provide a small OpenAI-compatible chat completions client for the AI runtime.
 */

import type {
  OpenAiCompatibleClient,
  OpenAiCompatibleClientConfig,
  OpenAiCompatibleCompletionInput,
  OpenAiCompatibleCompletionResult,
  OpenAiCompatibleFetchResponse,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const jsonParse = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const extractContent = (raw: unknown): string => {
  if (!isRecord(raw)) return '';
  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const firstChoice = choices[0];
  if (!isRecord(firstChoice)) return '';
  const message = isRecord(firstChoice.message) ? firstChoice.message : null;
  if (message && typeof message.content === 'string') return message.content;
  if (typeof firstChoice.text === 'string') return firstChoice.text;
  return '';
};

const responseFormatFor = (
  input: OpenAiCompatibleCompletionInput,
  supportsJsonSchema: boolean
): Record<string, unknown> | undefined => {
  if (input.schema && supportsJsonSchema) {
    return {
      type: 'json_schema',
      json_schema: {
        name: input.schema.name,
        schema: input.schema.schema,
        strict: true,
      },
    };
  }
  if (input.schema || !supportsJsonSchema) {
    return { type: 'json_object' };
  }
  return undefined;
};

export function createOpenAiCompatibleClient(config: OpenAiCompatibleClientConfig): OpenAiCompatibleClient {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    throw new Error('fetch is not available for OpenAI-compatible AI client requests.');
  }

  const timeoutMs = Number.isFinite(config.timeoutMs) && config.timeoutMs! > 0 ? config.timeoutMs! : DEFAULT_TIMEOUT_MS;
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;
  const supportsJsonSchema = config.supportsJsonSchema ?? true;

  return {
    describeConfig() {
      return {
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: '[REDACTED]',
        supportsJsonSchema,
        timeoutMs,
      };
    },
    async completeJson<T = unknown>(
      input: OpenAiCompatibleCompletionInput
    ): Promise<OpenAiCompatibleCompletionResult<T>> {
      const body: Record<string, unknown> = {
        model: config.model,
        messages: input.messages,
      };
      if (typeof input.temperature === 'number') body.temperature = input.temperature;
      if (typeof input.maxTokens === 'number') body.max_tokens = input.maxTokens;

      const responseFormat = responseFormatFor(input, supportsJsonSchema);
      if (responseFormat) body.response_format = responseFormat;

      config.logger?.({
        kind: 'request',
        url,
        model: config.model,
        responseFormat: responseFormat?.type === 'json_schema' ? 'json_schema' : responseFormat?.type === 'json_object' ? 'json_object' : 'none',
        apiKey: '[REDACTED]',
      });

      const controller = new AbortController();
      const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`OpenAI-compatible request failed with HTTP ${response.status}${errorText ? `: ${errorText}` : ''}`);
        }

        const raw = (await response.json()) as unknown;
        const content = extractContent(raw);
        const parsed = content ? jsonParse<T>(content) : null;
        config.logger?.({
          kind: 'response',
          url,
          status: response.status,
          model: config.model,
          parsed: parsed !== null,
        });

        return { raw, content, parsed, request: { url, body } };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
