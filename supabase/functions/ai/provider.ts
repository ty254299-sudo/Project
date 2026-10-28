import { ApiError } from '../api/validation.ts';
declare const Deno: { env: { get(name: string): string | undefined } };

export type ProviderMetrics = { inputTokens: number | null; outputTokens: number | null; latencyMs: number };
export class ProviderError extends ApiError {
  constructor(status: number, code: string, message: string, public metrics: ProviderMetrics) {
    super(status, code, message);
    this.name = 'ProviderError';
  }
}

const DEADLINE_MS = 25_000;
export const INPUT_TOKEN_BUDGET = 6_000;
export const OUTPUT_TOKEN_BUDGET = 700;

export function estimateInputTokens(text: string): number {
  // Conservative bound for mixed English/UTF-8 study text; actual usage is recorded from the provider.
  return Math.ceil(new TextEncoder().encode(text).byteLength / 3);
}

export async function completeStructured(options: {
  instructions: string; input: string; model: string; schemaName: string; schema: Record<string, unknown>; signal?: AbortSignal;
  apiKey?: string; fetcher?: typeof fetch; deadlineMs?: number;
}): Promise<{ value: unknown; metrics: ProviderMetrics }> {
  if (options.signal?.aborted) throw new ApiError(499, 'REQUEST_CANCELLED', 'The request was cancelled. Your input is still here.');
  const key = options.apiKey ?? Deno.env.get('OPENAI_API_KEY');
  if (!key || !options.model) throw new ApiError(503, 'MODEL_UNAVAILABLE', 'AI assistance is not configured yet. Your work is still here; try again after the service is configured.');
  const estimated = estimateInputTokens(`${options.instructions}\n${options.input}`);
  if (estimated > INPUT_TOKEN_BUDGET) throw new ApiError(413, 'AI_INPUT_LIMIT', 'This request is too large for the study assistant. Shorten the notes and retry.');

  const startedAt = Date.now();
  const controller = new AbortController();
  const abortFromClient = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abortFromClient, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('AI request deadline reached.', 'TimeoutError')), options.deadlineMs ?? DEADLINE_MS);
  let usage: { input_tokens?: unknown; output_tokens?: unknown } | null = null;
  const metrics = () => ({
    inputTokens: Number.isInteger(usage?.input_tokens) ? usage?.input_tokens as number : null,
    outputTokens: Number.isInteger(usage?.output_tokens) ? usage?.output_tokens as number : null,
    latencyMs: Date.now() - startedAt,
  });
  try {
    const response = await (options.fetcher ?? fetch)('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model, instructions: options.instructions, input: options.input,
        max_output_tokens: OUTPUT_TOKEN_BUDGET, store: false, truncation: 'disabled',
        text: { format: { type: 'json_schema', name: options.schemaName, strict: true, schema: options.schema } },
      }),
    });
    let payload: Record<string, unknown>;
    try { payload = await response.json(); } catch { throw new ProviderError(503, 'MODEL_INVALID_RESPONSE', 'AI returned an unreadable result. Your input is still here; retry.', metrics()); }
    if (payload.usage && typeof payload.usage === 'object') usage = payload.usage as { input_tokens?: unknown; output_tokens?: unknown };
    if (response.status === 429) throw new ProviderError(429, 'MODEL_RATE_LIMIT', 'AI is busy right now. Wait a moment and retry.', metrics());
    if (!response.ok) throw new ProviderError(503, 'MODEL_UNAVAILABLE', 'AI assistance is temporarily unavailable. Your input is still here; retry shortly.', metrics());
    if (payload.status === 'incomplete') throw new ProviderError(503, 'MODEL_INCOMPLETE', 'AI could not finish this response. Your input is still here; retry.', metrics());
    const output = Array.isArray(payload.output) ? payload.output : [];
    const refusal = output.some((item) => item && typeof item === 'object' && Array.isArray((item as Record<string, unknown>).content)
      && ((item as Record<string, unknown>).content as unknown[]).some((part) => part && typeof part === 'object' && (part as Record<string, unknown>).type === 'refusal'));
    if (refusal) throw new ProviderError(422, 'MODEL_REFUSAL', 'AI could not help with that request. Edit your question and try again.', metrics());
    const text = output.flatMap((item) => {
      if (!item || typeof item !== 'object' || (item as Record<string, unknown>).type !== 'message') return [];
      const content = (item as Record<string, unknown>).content;
      return Array.isArray(content) ? content.flatMap((part) => part && typeof part === 'object' && (part as Record<string, unknown>).type === 'output_text' && typeof (part as Record<string, unknown>).text === 'string' ? [(part as Record<string, unknown>).text as string] : []) : [];
    }).join('\n').trim();
    if (!text || text.length > 10_000) throw new ProviderError(503, 'MODEL_INVALID_RESPONSE', 'AI returned an empty or oversized result. Your input is still here; retry.', metrics());
    let value: unknown;
    try { value = JSON.parse(text) as unknown; } catch { throw new ProviderError(503, 'MODEL_INVALID_RESPONSE', 'AI returned malformed data. Your input is still here; retry.', metrics()); }
    return { value, metrics: metrics() };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const elapsed = metrics();
    if (options.signal?.aborted) throw new ProviderError(499, 'REQUEST_CANCELLED', 'The request was cancelled. Your input is still here.', elapsed);
    if (controller.signal.aborted) throw new ProviderError(504, 'MODEL_TIMEOUT', 'AI took too long to respond. Your input is still here; retry.', elapsed);
    throw new ProviderError(503, 'MODEL_UNAVAILABLE', 'AI assistance is temporarily unavailable. Your input is still here; retry shortly.', elapsed);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromClient);
  }
}
