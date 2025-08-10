import { env } from './env';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
// Omit ollama ai-sdk provider to avoid additional dependency; keep native HTTP path for ollama

export type AiProviderId = 'openai' | 'anthropic' | 'ollama' | 'lmstudio' | 'openrouter' | 'groq';

export type AiProviderConfig = {
  id?: number;
  provider: AiProviderId;
  apiKey?: string | null;
  baseUrl?: string | null; // for self-hosted or proxy endpoints
  model?: string | null;
  enabled?: boolean;
  timeoutMs?: number | null;
  label?: string | null;
  settings?: Record<string, any> | null;
};

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatResult = {
  ok: boolean;
  provider?: AiProviderId;
  model?: string;
  content?: string;
  error?: { code: string; message: string };
};

export function providerCatalog(): Array<{
  id: AiProviderId;
  name: string;
  defaultBaseUrl?: string;
  notes?: string;
}> {
  return [
    { id: 'openai', name: 'OpenAI', notes: 'Requires API key', defaultBaseUrl: 'https://api.openai.com/v1' },
    { id: 'anthropic', name: 'Anthropic', notes: 'Requires API key', defaultBaseUrl: 'https://api.anthropic.com' },
    { id: 'ollama', name: 'Ollama', notes: 'Local server', defaultBaseUrl: 'http://localhost:11434' },
    { id: 'lmstudio', name: 'LM Studio', notes: 'Local server (OpenAI compatible)', defaultBaseUrl: 'http://localhost:1234/v1' },
    { id: 'openrouter', name: 'OpenRouter', notes: 'Requires API key', defaultBaseUrl: 'https://openrouter.ai/api/v1' },
    { id: 'groq', name: 'Groq', notes: 'Requires API key', defaultBaseUrl: 'https://api.groq.com/openai/v1' },
  ];
}

function withTimeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => {
      try { (signal as any)?.throwIfAborted?.(); } catch {}
      reject(new Error('TIMEOUT'));
    }, ms);
    promise
      .then((v) => { clearTimeout(id); resolve(v); })
      .catch((e) => { clearTimeout(id); reject(e); });
  });
}

export async function fetchModels(config: AiProviderConfig): Promise<string[]> {
  const provider = config.provider;
  const baseUrl = (config.baseUrl || '').replace(/\/$/, '');
  const timeout = config.timeoutMs || env.aiRequestTimeoutMs;

  if (provider === 'openai' || provider === 'openrouter' || provider === 'groq' || provider === 'lmstudio') {
    // OpenAI-compatible endpoint: GET /models
    const controller = new AbortController();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (provider !== 'lmstudio') headers['authorization'] = `Bearer ${config.apiKey || ''}`;
    // LM Studio typically does not need auth
    const url = `${baseUrl || providerCatalog().find(p => p.id === (provider === 'lmstudio' ? 'lmstudio' : provider))?.defaultBaseUrl}/models`;
    const res = await withTimeout(fetch(url, { signal: controller.signal, headers, cache: 'no-store' }), timeout, controller.signal);
    if (!res.ok) {
      const t = await safeText(res);
      throw new Error(`HTTP_${res.status}: ${t}`);
    }
    const json: any = await res.json();
    const models: string[] = Array.isArray(json?.data)
      ? json.data.map((m: any) => (typeof m === 'string' ? m : m?.id)).filter((s: any) => typeof s === 'string')
      : [];
    return models;
  }

  if (provider === 'anthropic') {
    const controller = new AbortController();
    const base = baseUrl || providerCatalog().find(p => p.id === 'anthropic')!.defaultBaseUrl!;
    const res = await withTimeout(fetch(`${base}/v1/models`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
      },
    }), timeout, controller.signal);
    if (!res.ok) throw new Error(`HTTP_${res.status}: ${await safeText(res)}`);
    const json: any = await res.json();
    const models: string[] = Array.isArray(json?.data)
      ? json.data.map((m: any) => m?.id || m?.name).filter((s: any) => typeof s === 'string')
      : [];
    return models;
  }

  if (provider === 'ollama') {
    const controller = new AbortController();
    const base = baseUrl || providerCatalog().find(p => p.id === 'ollama')!.defaultBaseUrl!;
    const res = await withTimeout(fetch(`${base}/api/tags`, { signal: controller.signal, cache: 'no-store' }), timeout, controller.signal);
    if (!res.ok) throw new Error(`HTTP_${res.status}: ${await safeText(res)}`);
    const json: any = await res.json();
    const models: string[] = Array.isArray(json?.models)
      ? json.models.map((m: any) => m?.name).filter((s: any) => typeof s === 'string')
      : [];
    return models;
  }

  return [];
}

export async function chatCompletion(config: AiProviderConfig, messages: ChatMessage[]): Promise<ChatResult> {
  const provider = config.provider;
  const timeout = (config.timeoutMs ?? (provider === 'ollama' ? 60000 : env.aiRequestTimeoutMs));
  const controller = new AbortController();
  const baseUrl = (config.baseUrl || '').replace(/\/$/, '');
  try {
    // Use Vercel AI SDK where possible for stability and consistent parsing
    const system = messages.find((m) => m.role === 'system')?.content;
    const userAndAssistant = messages.filter((m) => m.role !== 'system');
    if (provider === 'openai' || provider === 'groq') {
      const base = baseUrl || (provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1');
      const openai = createOpenAI({ apiKey: config.apiKey || '', baseURL: base });
      const model = openai.chat(config.model || 'gpt-4o-mini');
      const result = await withTimeout(generateText({
        model,
        system,
        messages: userAndAssistant as any,
        temperature: 1,
      }), timeout, controller.signal);
      return { ok: true, provider, model: config.model || '', content: result.text };
    }
    else if (provider === 'anthropic') {
      const base = baseUrl || 'https://api.anthropic.com';
      try {
        const anthropic = createAnthropic({ apiKey: config.apiKey || '', baseURL: base });
        const model = anthropic.messages(config.model || 'claude-3-5-sonnet-latest');
        const result = await withTimeout(generateText({
          model,
          system,
          messages: userAndAssistant as any,
          temperature: 1,
        }), timeout, controller.signal);
        return { ok: true, provider, model: config.model || '', content: result.text };
      } catch (e: any) {
        try { console.error('[ai-chat] Anthropic SDK failed', { message: e?.message }); } catch {}
        // Fallback to raw HTTP for clearer error details
        const res = await withTimeout(fetch(`${base}/v1/messages`, {
          method: 'POST',
          signal: controller.signal,
          cache: 'no-store',
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.apiKey || '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 512,
            temperature: 1,
            system,
            messages: userAndAssistant.map((m) => ({ role: m.role, content: m.content })),
          }),
        }), timeout, controller.signal);
        if (!res.ok) {
          const text = await safeText(res);
          try { console.error('[ai-chat] Anthropic HTTP failed', { status: res.status, text }); } catch {}
          return { ok: false, error: { code: `HTTP_${res.status}`, message: text || 'Anthropic request failed' } };
        }
        const json: any = await res.json();
        const content: string | undefined = json?.content?.[0]?.text || json?.content?.[0]?.content?.[0]?.text;
        if (!content) return { ok: false, error: { code: 'NO_CONTENT', message: 'No content' } };
        return { ok: true, provider, model: config.model || '', content };
      }
    }
    else if (provider === 'ollama') {
      // handled below with native HTTP path
    }
    else if (provider === 'openrouter' || provider === 'lmstudio') {
      const base = baseUrl || providerCatalog().find(p => p.id === (provider === 'lmstudio' ? 'lmstudio' : provider))!.defaultBaseUrl!;
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (provider !== 'lmstudio') headers['authorization'] = `Bearer ${config.apiKey || ''}`;

      // First try Chat Completions
      const chatUrl = `${base}/chat/completions`;
      const payload = { model: config.model, messages, stream: false, temperature: 1 };
      const ccRes = await withTimeout(fetch(chatUrl, {
        method: 'POST',
        signal: controller.signal,
        headers,
        cache: 'no-store',
        body: JSON.stringify(payload),
      }), timeout, controller.signal);
      if (ccRes.ok) {
        const json: any = await ccRes.json();
        const content: string | undefined = json?.choices?.[0]?.message?.content;
        if (!content) return { ok: false, error: { code: 'NO_CONTENT', message: 'No content' } };
        return { ok: true, provider, model: config.model || '', content };
      }

      const ccStatus = ccRes.status;
      const ccText = await safeText(ccRes);
      try {
        // eslint-disable-next-line no-console
        console.error('[ai-chat] CC failed', { provider, status: ccStatus, text: ccText, base: baseUrl });
      } catch {}

      // Optional fallback to Responses API for providers that support it (OpenRouter)
      if (provider === 'openrouter') {
        try {
          const responsesUrl = `${base}/responses`;
          const input = messages.map((m) => ({
            role: m.role,
            content: [{ type: 'text', text: m.content }],
          }));
          const rPayload = { model: config.model, input } as any;
          const rRes = await withTimeout(fetch(responsesUrl, {
            method: 'POST',
            signal: controller.signal,
            headers,
            cache: 'no-store',
            body: JSON.stringify(rPayload),
          }), timeout, controller.signal);
          if (rRes.ok) {
            const rJson: any = await rRes.json();
            const content: string | undefined = rJson?.output_text
              || rJson?.output?.[0]?.content?.[0]?.text
              || rJson?.content?.[0]?.text;
            if (!content) return { ok: false, error: { code: 'NO_CONTENT', message: 'No content' } };
            return { ok: true, provider, model: config.model || '', content };
          }
          const rText = await safeText(rRes);
          try { console.error('[ai-chat] Responses failed', { provider, status: rRes.status, text: rText }); } catch {}
          return { ok: false, error: { code: `HTTP_${rRes.status}`, message: rText || `Chat failed (CC ${ccStatus}: ${ccText})` } };
        } catch (e: any) {
          try { console.error('[ai-chat] Responses exception', { provider, error: e?.message }); } catch {}
          return { ok: false, error: { code: 'ERR', message: e?.message || `Chat failed (CC ${ccStatus}: ${ccText})` } };
        }
      }

      return { ok: false, error: { code: `HTTP_${ccStatus}`, message: ccText } };
    }

    if (provider === 'ollama') {
      const base = baseUrl || providerCatalog().find(p => p.id === 'ollama')!.defaultBaseUrl!;
      const res = await withTimeout(fetch(`${base}/api/chat`, {
        method: 'POST',
        signal: controller.signal,
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          stream: false,
          messages,
          options: { temperature: 1 },
        }),
      }), timeout, controller.signal);
      if (!res.ok) return { ok: false, error: { code: `HTTP_${res.status}`, message: await safeText(res) } };
      const json: any = await res.json();
      const content: string | undefined = json?.message?.content || json?.response;
      if (!content) return { ok: false, error: { code: 'NO_CONTENT', message: 'No content' } };
      return { ok: true, provider, model: config.model || '', content };
    }

    return { ok: false, error: { code: 'UNSUPPORTED', message: `Unsupported provider: ${provider}` } };
  } catch (e: any) {
    if (e?.message === 'TIMEOUT') return { ok: false, error: { code: 'TIMEOUT', message: 'Request timed out' } };
    return { ok: false, error: { code: 'ERR', message: e?.message || 'Request failed' } };
  }
}

export async function chatWithFailover(configs: AiProviderConfig[], messages: ChatMessage[]): Promise<ChatResult & { tried: Array<{ provider: AiProviderId; code: string; message: string }> }> {
  const tried: Array<{ provider: AiProviderId; code: string; message: string }> = [];
  for (const cfg of configs) {
    const res = await chatCompletion(cfg, messages);
    if (res.ok) return { ...res, tried } as any;
    tried.push({ provider: cfg.provider, code: res.error?.code || 'ERR', message: res.error?.message || 'failed' });
  }
  return { ok: false, error: { code: 'ALL_FAILED', message: 'All providers failed' }, tried } as any;
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return 'unknown error'; }
}


