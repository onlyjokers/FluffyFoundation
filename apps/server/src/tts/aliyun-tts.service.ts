/**
 * Purpose: Server-side Aliyun DashScope TTS proxy for safe API-key handling.
 */
type AliyunTtsFetch = typeof fetch;

export type AliyunTtsServiceOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: AliyunTtsFetch;
};

export type AliyunTtsRequest = {
  text: string;
  model?: string;
  voice?: string;
  languageType?: string;
  instructions?: string;
  optimizeInstructions?: boolean;
};

export type AliyunTtsResult = {
  url: string;
  mimeType: string;
  usage: Record<string, unknown> | null;
};

function guessMimeType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.wav')) return 'audio/wav';
  if (lower.includes('.mp3')) return 'audio/mpeg';
  if (lower.includes('.m4a')) return 'audio/mp4';
  return 'audio/wav';
}

const DEFAULT_TTS_API_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

export class AliyunTtsService {
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: AliyunTtsFetch;

  constructor(options: AliyunTtsServiceOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async synthesize(request: AliyunTtsRequest): Promise<AliyunTtsResult> {
    const apiKey = this.env.DASHSCOPE_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('DASHSCOPE_API_KEY is not configured');
    }

    const text = request.text?.trim() ?? '';
    if (!text) {
      throw new Error('TTS text is required');
    }

    const model = request.model?.trim() || this.env.SHUGU_TTS_MODEL?.trim() || 'qwen3-tts-flash';
    const voice = request.voice?.trim() || this.env.SHUGU_TTS_VOICE?.trim() || 'Cherry';
    const languageType = request.languageType?.trim() || this.env.SHUGU_TTS_LANGUAGE?.trim() || 'Chinese';
    const instructions = request.instructions?.trim() || this.env.SHUGU_TTS_INSTRUCTIONS?.trim() || '';
    const optimizeInstructions = request.optimizeInstructions ?? false;
    const apiUrl = this.env.DASHSCOPE_TTS_API_URL?.trim() || DEFAULT_TTS_API_URL;

    const response = await this.fetchImpl(
      apiUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: {
            text,
            voice,
            language_type: languageType,
          },
          ...(instructions
            ? {
                parameters: {
                  instructions,
                  optimize_instructions: Boolean(optimizeInstructions),
                },
              }
            : {}),
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Aliyun TTS request failed (${response.status}): ${body || response.statusText}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const output = json.output as Record<string, unknown> | undefined;
    const audio = output?.audio as Record<string, unknown> | undefined;
    const url = typeof audio?.url === 'string' ? audio.url : '';
    if (!url) {
      throw new Error('Aliyun TTS response missing audio url');
    }

    const usage = (json.usage as Record<string, unknown> | undefined) ?? null;
    return { url, mimeType: guessMimeType(url), usage };
  }
}
