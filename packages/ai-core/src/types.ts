export type AiRuntimeStatus = 'disabled' | 'enabling' | 'enabled' | 'error';

export type AiRuntimeState = {
  status: AiRuntimeStatus;
  error: string | null;
  updatedAt: number;
};

export type AiRuntimeEnableOptions = {
  modelRef?: string;
  backend?: 'local' | 'remote' | 'hybrid';
};

export type AiRuntimeInferInput = {
  vector: number[];
};

export type AiRuntimeInferOutput = {
  vector: number[];
};

export interface AiRuntime {
  getState(): AiRuntimeState;
  enable(options?: AiRuntimeEnableOptions): Promise<void>;
  disable(): Promise<void>;
  dispose(): Promise<void>;
  infer?(input: AiRuntimeInferInput): Promise<AiRuntimeInferOutput>;
}

export type OpenAiCompatibleJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
};

export type OpenAiCompatibleMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
};

export type OpenAiCompatibleFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

export type OpenAiCompatibleLoggerEvent =
  | {
      kind: 'request';
      url: string;
      model: string;
      responseFormat: 'json_schema' | 'json_object' | 'none';
      apiKey: '[REDACTED]';
    }
  | {
      kind: 'response';
      url: string;
      status: number;
      model: string;
      parsed: boolean;
    };

export type OpenAiCompatibleClientConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<OpenAiCompatibleFetchResponse>;
  supportsJsonSchema?: boolean;
  timeoutMs?: number;
  logger?: (event: OpenAiCompatibleLoggerEvent) => void;
};

export type OpenAiCompatibleCompletionInput = {
  messages: OpenAiCompatibleMessage[];
  temperature?: number;
  maxTokens?: number;
  schema?: OpenAiCompatibleJsonSchema;
};

export type OpenAiCompatibleCompletionResult<T = unknown> = {
  raw: unknown;
  content: string;
  parsed: T | null;
  request: {
    url: string;
    body: Record<string, unknown>;
  };
};

export interface OpenAiCompatibleClient {
  completeJson<T = unknown>(input: OpenAiCompatibleCompletionInput): Promise<OpenAiCompatibleCompletionResult<T>>;
  describeConfig(): {
    baseUrl: string;
    model: string;
    apiKey: '[REDACTED]';
    supportsJsonSchema: boolean;
    timeoutMs: number;
  };
}
