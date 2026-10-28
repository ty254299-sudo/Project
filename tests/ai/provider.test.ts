import { describe, expect, it } from 'vitest';
import { completeStructured, estimateInputTokens, ProviderError } from '../../supabase/functions/ai/provider.ts';

const options = { instructions: 'Return JSON.', input: 'A short study question.', model: 'test-model', schemaName: 'test', schema: { type: 'object' }, apiKey: 'test-key' };

describe('AI provider limits and recoverable failures', () => {
  it('estimates input within the bounded request budget', () => {
    expect(estimateInputTokens('abc')).toBe(1);
    expect(estimateInputTokens('x'.repeat(20_000))).toBeGreaterThan(6_000);
  });

  it('records provider latency and token usage', async () => {
    const result = await completeStructured({ ...options, fetcher: async () => new Response(JSON.stringify({
      status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] },
      ], usage: { input_tokens: 18, output_tokens: 5 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }) });
    expect(result.value).toEqual({ ok: true });
    expect(result.metrics.inputTokens).toBe(18);
    expect(result.metrics.outputTokens).toBe(5);
    expect(result.metrics.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns an actionable timeout without fabricating a result', async () => {
    await expect(completeStructured({ ...options, deadlineMs: 5, fetcher: (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }) })).rejects.toMatchObject({ code: 'MODEL_TIMEOUT', status: 504 });
    expect(() => { throw new ProviderError(504, 'MODEL_TIMEOUT', 'Timed out.', { inputTokens: null, outputTokens: null, latencyMs: 5 }); }).toThrow();
  });
});
