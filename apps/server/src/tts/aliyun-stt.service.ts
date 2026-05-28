/**
 * Purpose: Server-side Aliyun DashScope STT proxy for safe API-key handling.
 */

type AliyunSttFetch = typeof fetch;

export type AliyunSttServiceOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: AliyunSttFetch;
};

export type AliyunSttRequest = {
  audioBytes: Uint8Array;
  mimeType: string;
  model?: string;
};

export type AliyunSttResult = {
  text: string;
  taskId: string;
  raw: Record<string, unknown>;
};

const DEFAULT_STT_API_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function normalizeMimeType(mimeType: string): string {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() || '';
  return normalized || 'audio/webm';
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function textFromQwenAsrPayload(payload: Record<string, unknown>): string {
  const output = asRecord(payload.output);
  const choices = Array.isArray(output.choices) ? output.choices : [];
  const parts = choices
    .flatMap((choice) => {
      const message = asRecord(asRecord(choice).message);
      const content = message.content;
      if (typeof content === 'string') return [content.trim()];
      if (!Array.isArray(content)) return [];
      return content.map((item) => {
        const record = asRecord(item);
        return typeof record.text === 'string' ? record.text.trim() : '';
      });
    })
    .filter(Boolean);
  if (parts.length > 0) return parts.join('\n');

  const directText = typeof output.text === 'string' ? output.text.trim() : '';
  if (directText) return directText;

  const transcripts = Array.isArray(output.transcripts)
    ? output.transcripts
    : Array.isArray(payload.transcripts)
      ? payload.transcripts
      : [];
  return transcripts
    .map((item) => {
      const record = asRecord(item);
      return typeof record.text === 'string' ? record.text.trim() : '';
    })
    .filter(Boolean)
    .join('\n');
}

export class AliyunSttService {
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: AliyunSttFetch;

  constructor(options: AliyunSttServiceOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async transcribe(request: AliyunSttRequest): Promise<AliyunSttResult> {
    const apiKey = this.env.DASHSCOPE_API_KEY?.trim();
    if (!apiKey) throw new Error('DASHSCOPE_API_KEY is not configured');

    const audioBytes = request.audioBytes;
    if (!audioBytes || audioBytes.byteLength === 0) throw new Error('STT audio bytes are required');

    const model = request.model?.trim() || this.env.SHUGU_STT_MODEL?.trim() || 'qwen3-asr-flash';
    const apiUrl = this.env.DASHSCOPE_STT_API_URL?.trim() || DEFAULT_STT_API_URL;
    const mimeType = normalizeMimeType(request.mimeType);

    const response = await this.fetchImpl(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: {
          messages: [
            {
              role: 'user',
              content: [{ audio: `data:${mimeType};base64,${toBase64(audioBytes)}` }],
            },
          ],
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Aliyun STT request failed (${response.status}): ${body || response.statusText}`
      );
    }

    const json = asRecord(await response.json().catch(() => ({})));
    const output = asRecord(json.output);
    const taskId = typeof output.task_id === 'string' ? output.task_id : '';
    return { text: textFromQwenAsrPayload(json), taskId, raw: json };
  }
}
