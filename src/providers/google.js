import { sanitizeGoogleThinkingLevel } from '../config.js';

/**
 * Build Google Gemini `generateContent` REST payload for Gemini 4 Neon / Argon / Hydrogen.
 * Follows Nov 2026 Gemini 4 Neon specification:
 * - Uses `generationConfig.thinkingConfig.thinkingLevel` (`low` | `medium` | `high` | `xhigh`).
 * - Never sends deprecated `thinkingBudget` or rejected `minimal`.
 * - Omits sampling parameters (`temperature`, `topP`, `topK`) since Gemini 4 ignores or 400s on them.
 * - Uses 65,536 maxOutputTokens per synchronous hop so thinking + visible output don't truncate.
 */
export function buildGoogleGenerateContentPayload({
  systemPrompt = '',
  userPrompt = '',
  thinkingLevel = 'high',
  jsonMode = true,
  maxOutputTokens = 65536
}) {
  const level = sanitizeGoogleThinkingLevel(thinkingLevel);
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: String(userPrompt || '').trim() }]
      }
    ],
    generationConfig: {
      thinkingConfig: {
        thinkingLevel: level
      },
      maxOutputTokens: Math.max(1024, Math.min(65536, Number(maxOutputTokens) || 65536))
    }
  };

  if (systemPrompt && systemPrompt.trim()) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt.trim() }]
    };
  }

  if (jsonMode) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  return body;
}

/**
 * Build Google Gemini Interactions API (/v1beta/interactions) payload for Gemini 4 Neon.
 * Uses snake_case fields inside `generation_config`.
 */
export function buildGoogleInteractionsPayload({
  model = 'gemini-4-neon',
  systemPrompt = '',
  userPrompt = '',
  thinkingLevel = 'high',
  maxOutputTokens = 65536
}) {
  const level = sanitizeGoogleThinkingLevel(thinkingLevel);
  const body = {
    model: String(model || 'gemini-4-neon').trim(),
    input: String(userPrompt || '').trim(),
    store: false,
    generation_config: {
      thinking_level: level,
      max_output_tokens: Math.max(1024, Math.min(65536, Number(maxOutputTokens) || 65536))
    }
  };
  if (systemPrompt && systemPrompt.trim()) {
    body.system_instruction = systemPrompt.trim();
  }
  return body;
}

export function parseGoogleResult(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Google Gemini 响应为空或格式无效');
  }
  if (data.error) {
    const msg = data.error.message || JSON.stringify(data.error);
    throw new Error(`Google Gemini API 错误: ${msg}`);
  }

  // Interactions API shape
  if ('status' in data || Array.isArray(data.steps)) {
    const status = data.status || 'unknown';
    if (status !== 'completed') {
      throw new Error(`Gemini Interactions 状态为 ${status}（非 completed），请检查 max_output_tokens 或稍后重试`);
    }
    const textChunks = [];
    const thoughtChunks = [];
    for (const step of data.steps || []) {
      if (!step || typeof step !== 'object') continue;
      if (step.type === 'model_output' && Array.isArray(step.content)) {
        for (const item of step.content) {
          if (item?.type === 'text' && item.text) textChunks.push(item.text);
        }
      } else if (step.type === 'thought' && Array.isArray(step.content)) {
        for (const item of step.content) {
          if (item?.text) thoughtChunks.push(item.text);
        }
      }
    }
    const text = textChunks.join('');
    if (!text.trim()) {
      throw new Error('Gemini Interactions 已完成但未返回可见正文');
    }
    const u = data.usage || {};
    return {
      text,
      thoughtSummary: thoughtChunks.join('\n\n'),
      status,
      usage: {
        inputTokens: u.total_input_tokens ?? null,
        cachedTokens: u.total_cached_tokens ?? 0,
        outputTokens: u.total_output_tokens ?? null,
        reasoningTokens: u.total_thought_tokens ?? null,
        totalTokens: u.total_tokens ?? null
      }
    };
  }

  // generateContent REST shape
  const blockReason = data.promptFeedback?.blockReason;
  const candidates = data.candidates || [];
  if (!candidates.length) {
    throw new Error(`Google Gemini 未返回候选结果 (blockReason=${blockReason || 'NONE'})`);
  }

  const cand = candidates[0] || {};
  const finishReason = cand.finishReason || 'STOP';
  const parts = cand.content?.parts || [];
  const visibleParts = [];
  const thoughtParts = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object' || typeof part.text !== 'string') continue;
    if (part.thought) {
      thoughtParts.push(part.text);
    } else {
      visibleParts.push(part.text);
    }
  }
  const text = visibleParts.join('');

  if (finishReason === 'MAX_TOKENS' && !text.trim()) {
    throw new Error('Gemini 4 思考阶段耗尽 maxOutputTokens (MAX_TOKENS)，未产生正文输出');
  }
  if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
    throw new Error(`Gemini 输出异常终止 (finishReason=${finishReason})`);
  }
  if (!text.trim()) {
    throw new Error('Google Gemini 返回成功但未包含可见正文');
  }

  const u = data.usageMetadata || {};
  return {
    text,
    thoughtSummary: thoughtParts.join('\n\n'),
    status: finishReason,
    usage: {
      inputTokens: u.promptTokenCount ?? null,
      cachedTokens: u.cachedContentTokenCount ?? 0,
      outputTokens: u.candidatesTokenCount ?? null,
      reasoningTokens: u.thoughtsTokenCount ?? null,
      totalTokens: u.totalTokenCount ?? null
    }
  };
}

function formatGoogleHttpError(status, bodyText, model) {
  let detail = bodyText;
  try {
    const parsed = JSON.parse(bodyText);
    detail = parsed?.error?.message || parsed?.message || bodyText;
  } catch {
    // keep snippet
  }
  detail = String(detail || '').slice(0, 320);
  if (status === 401 || status === 403) {
    return `Google Gemini 鉴权或项目权限失败 (${status}, model=${model})：注意 gemini-4-neon 需使用已启用 Paid Tier 计费的 Gemini API 项目密钥。详情：${detail}`;
  }
  if (status === 404) {
    return `Google Gemini 模型或路径未找到 (404, model=${model})：请确认模型 ID（如 gemini-4-neon，不带 -preview）与 Base URL。详情：${detail}`;
  }
  if (status === 429) {
    return `Google Gemini 触发限流或配额不足 (429)：请稍后重试。详情：${detail}`;
  }
  return `Google Gemini 请求失败 (HTTP ${status})：${detail}`;
}

export async function callGoogle({
  apiKey,
  baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  model = 'gemini-4-neon',
  thinkingLevel = 'high',
  protocol = 'generate_content',
  systemPrompt = '',
  userPrompt = '',
  jsonMode = true,
  maxOutputTokens = 65536,
  timeoutMs = 900_000,
  signal
}) {
  if (!apiKey) {
    throw new Error('未配置 Google Gemini API Key，请在「模型与密钥设置」中填入或配置环境变量 GEMINI_API_KEY');
  }

  const cleanBase = String(baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const cleanModel = String(model || 'gemini-4-neon').trim();
  const useInteractions = protocol === 'interactions';
  const endpoint = useInteractions
    ? `${cleanBase}/interactions`
    : `${cleanBase}/models/${encodeURIComponent(cleanModel)}:generateContent`;

  const payload = useInteractions
    ? buildGoogleInteractionsPayload({
        model: cleanModel,
        systemPrompt,
        userPrompt,
        thinkingLevel,
        maxOutputTokens
      })
    : buildGoogleGenerateContentPayload({
        systemPrompt,
        userPrompt,
        thinkingLevel,
        jsonMode,
        maxOutputTokens
      });

  const startedAt = Date.now();
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(payload),
    signal: combinedSignal
  });

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(formatGoogleHttpError(response.status, rawBody, cleanModel));
  }

  let data;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(`Google Gemini 返回非 JSON 内容: ${rawBody.slice(0, 200)}`);
  }

  const parsed = parseGoogleResult(data);
  return {
    ...parsed,
    provider: 'google',
    model: data.modelVersion || cleanModel,
    reasoningLevel: sanitizeGoogleThinkingLevel(thinkingLevel),
    protocol: useInteractions ? 'interactions' : 'generate_content',
    latencyMs: Date.now() - startedAt,
    isSandbox: false
  };
}

export async function testGoogleConnection({
  apiKey,
  baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  model = 'gemini-4-neon',
  protocol = 'generate_content',
  timeoutMs = 45_000
}) {
  const result = await callGoogle({
    apiKey,
    baseUrl,
    model,
    thinkingLevel: 'low',
    protocol,
    systemPrompt: '你是接口连通性检测助手，只输出简短 JSON。',
    userPrompt: '返回 JSON: {"ok": true, "greeting": "ready"}',
    jsonMode: true,
    maxOutputTokens: 2048,
    timeoutMs
  });
  return {
    ok: true,
    provider: 'google',
    model: result.model,
    protocol: result.protocol,
    latencyMs: result.latencyMs,
    usage: result.usage,
    sample: result.text.slice(0, 120)
  };
}
