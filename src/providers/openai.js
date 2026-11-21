import { sanitizeOpenAIEffort } from '../config.js';

/**
 * Build OpenAI Responses API (/v1/responses) request payload for GPT-6.2 Sol / Astra.
 * Follows Nov 2026 GPT-6.2 best practices:
 * - Reusable instructions go in `input[0]` with role `developer` for prompt caching.
 * - Reasoning effort must be low | medium | high | xhigh | max (never `none`).
 * - Do not pass temperature / top_p on reasoning calls.
 */
export function buildOpenAIResponsesPayload({
  model = 'gpt-6.2-sol',
  reasoningEffort = 'high',
  systemPrompt = '',
  userPrompt = '',
  jsonMode = true,
  maxOutputTokens = 32768
}) {
  const effort = sanitizeOpenAIEffort(reasoningEffort);
  const input = [];
  if (systemPrompt && systemPrompt.trim()) {
    input.push({ role: 'developer', content: systemPrompt.trim() });
  }
  input.push({ role: 'user', content: String(userPrompt || '').trim() });

  const body = {
    model: String(model || 'gpt-6.2-sol').trim(),
    input,
    reasoning: {
      effort,
      summary: 'auto'
    },
    max_output_tokens: Math.max(256, Number(maxOutputTokens) || 32768),
    store: false
  };

  if (jsonMode) {
    body.text = {
      format: { type: 'json_object' }
    };
  }

  return body;
}

/**
 * Build OpenAI Chat Completions (/v1/chat/completions) compatibility payload
 * for third-party OpenAI-compatible relays that do not expose /v1/responses.
 */
export function buildOpenAIChatPayload({
  model = 'gpt-6.2-sol',
  reasoningEffort = 'high',
  systemPrompt = '',
  userPrompt = '',
  jsonMode = true,
  maxOutputTokens = 32768
}) {
  const effort = sanitizeOpenAIEffort(reasoningEffort);
  const messages = [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: 'developer', content: systemPrompt.trim() });
  }
  messages.push({ role: 'user', content: String(userPrompt || '').trim() });

  const body = {
    model: String(model || 'gpt-6.2-sol').trim(),
    messages,
    reasoning_effort: effort,
    max_completion_tokens: Math.max(256, Number(maxOutputTokens) || 32768)
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  return body;
}

export function parseOpenAIResponsesResult(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('OpenAI 响应为空或格式无效');
  }
  if (data.error) {
    const msg = data.error.message || JSON.stringify(data.error);
    throw new Error(`OpenAI API 错误: ${msg}`);
  }

  // Chat Completions compatibility shape
  if (Array.isArray(data.choices)) {
    const choice = data.choices[0] || {};
    const msg = choice.message || {};
    const text = typeof msg.content === 'string' ? msg.content : '';
    const reasoningSummary =
      typeof msg.reasoning_content === 'string' ? msg.reasoning_content : '';
    if (!text.trim()) {
      throw new Error(`OpenAI 返回空文本 (finish_reason=${choice.finish_reason || 'unknown'})`);
    }
    const u = data.usage || {};
    return {
      text,
      thoughtSummary: reasoningSummary,
      status: choice.finish_reason || 'completed',
      usage: {
        inputTokens: u.prompt_tokens ?? null,
        cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
        outputTokens: u.completion_tokens ?? null,
        reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? null,
        totalTokens: u.total_tokens ?? null
      }
    };
  }

  const status = data.status || 'completed';
  if (status === 'failed' || status === 'cancelled') {
    throw new Error(`OpenAI 任务状态异常: ${status}`);
  }

  let text = typeof data.output_text === 'string' ? data.output_text : '';
  const thoughts = [];

  if (Array.isArray(data.output)) {
    const textChunks = [];
    for (const item of data.output) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'reasoning' && Array.isArray(item.summary)) {
        for (const s of item.summary) {
          if (s && typeof s.text === 'string' && s.text.trim()) {
            thoughts.push(s.text.trim());
          }
        }
      } else if (item.type === 'message' && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part && (part.type === 'output_text' || part.type === 'text') && part.text) {
            textChunks.push(part.text);
          }
        }
      }
    }
    if (!text && textChunks.length) {
      text = textChunks.join('');
    }
  }

  if (status === 'incomplete' && !text.trim()) {
    const reason = data.incomplete_details?.reason || 'max_output_tokens';
    throw new Error(`OpenAI 推理耗尽输出预算未产生正文 (${reason})，建议提高 max_output_tokens 或降低思考强度`);
  }
  if (!text.trim()) {
    throw new Error('OpenAI 响应成功但未包含可见输出文本');
  }

  const u = data.usage || {};
  return {
    text,
    thoughtSummary: thoughts.join('\n\n'),
    status,
    usage: {
      inputTokens: u.input_tokens ?? null,
      cachedTokens: u.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: u.output_tokens ?? null,
      reasoningTokens: u.output_tokens_details?.reasoning_tokens ?? null,
      totalTokens: u.total_tokens ?? null
    }
  };
}

function formatHttpError(status, bodyText, model) {
  let detail = bodyText;
  try {
    const parsed = JSON.parse(bodyText);
    detail = parsed?.error?.message || parsed?.message || bodyText;
  } catch {
    // keep raw snippet
  }
  detail = String(detail || '').slice(0, 320);
  if (status === 401) return `OpenAI API Key 鉴权失败 (401)：请检查密钥是否正确。详情：${detail}`;
  if (status === 404) return `OpenAI 模型或接口路径不可用 (404, model=${model})：请确认 Base URL 与模型 ID。详情：${detail}`;
  if (status === 429) return `OpenAI 触发限流或配额不足 (429)：请稍后重试或检查账单额度。详情：${detail}`;
  return `OpenAI 请求失败 (HTTP ${status})：${detail}`;
}

export async function callOpenAI({
  apiKey,
  baseUrl = 'https://api.openai.com/v1',
  model = 'gpt-6.2-sol',
  reasoningEffort = 'high',
  protocol = 'responses',
  systemPrompt = '',
  userPrompt = '',
  jsonMode = true,
  maxOutputTokens = 32768,
  timeoutMs = 900_000,
  signal
}) {
  if (!apiKey) {
    throw new Error('未配置 OpenAI API Key，请在「模型与密钥设置」中填入或配置环境变量 OPENAI_API_KEY');
  }

  const cleanBase = String(baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const useChat = protocol === 'chat_completions';
  const endpoint = useChat ? `${cleanBase}/chat/completions` : `${cleanBase}/responses`;
  const payload = useChat
    ? buildOpenAIChatPayload({ model, reasoningEffort, systemPrompt, userPrompt, jsonMode, maxOutputTokens })
    : buildOpenAIResponsesPayload({ model, reasoningEffort, systemPrompt, userPrompt, jsonMode, maxOutputTokens });

  const startedAt = Date.now();
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload),
    signal: combinedSignal
  });

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(formatHttpError(response.status, rawBody, model));
  }

  let data;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(`OpenAI 返回非 JSON 内容: ${rawBody.slice(0, 200)}`);
  }

  const parsed = parseOpenAIResponsesResult(data);
  return {
    ...parsed,
    provider: 'openai',
    model: data.model || model,
    reasoningLevel: sanitizeOpenAIEffort(reasoningEffort),
    protocol: useChat ? 'chat_completions' : 'responses',
    latencyMs: Date.now() - startedAt,
    isSandbox: false
  };
}

export async function testOpenAIConnection({
  apiKey,
  baseUrl = 'https://api.openai.com/v1',
  model = 'gpt-6.2-sol',
  protocol = 'responses',
  timeoutMs = 45_000
}) {
  const result = await callOpenAI({
    apiKey,
    baseUrl,
    model,
    reasoningEffort: 'low',
    protocol,
    systemPrompt: '你是接口连通性检测助手，只输出简短 JSON。',
    userPrompt: '返回 JSON: {"ok": true, "greeting": "ready"}',
    jsonMode: true,
    maxOutputTokens: 512,
    timeoutMs
  });
  return {
    ok: true,
    provider: 'openai',
    model: result.model,
    protocol: result.protocol,
    latencyMs: result.latencyMs,
    usage: result.usage,
    sample: result.text.slice(0, 120)
  };
}
