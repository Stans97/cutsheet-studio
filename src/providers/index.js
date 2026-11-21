import { getConfig, sanitizeOpenAIEffort, sanitizeGoogleThinkingLevel } from '../config.js';
import { callOpenAI, testOpenAIConnection } from './openai.js';
import { callGoogle, testGoogleConnection } from './google.js';
import { runSandboxStage } from './sandbox.js';

/**
 * Resiliently extract a JSON object from model text (handles markdown fences or stray prose).
 */
export function extractJsonObject(rawText) {
  const text = String(rawText || '').trim();
  if (!text) throw new Error('模型输出为空，无法解析 JSON');

  // 1. Direct parse
  try {
    return JSON.parse(text);
  } catch {
    // continue
  }

  // 2. Fenced ```json ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }

  // 3. Balanced outer brace scan
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const candidate = text.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  throw new Error(`无法将模型返回内容解析为结构化 JSON：${text.slice(0, 180)}`);
}

/**
 * Merge server-side environment defaults with per-request guest overrides.
 * Never persists user-supplied API keys to disk.
 */
export function resolveGatewaySettings(requestOverride = {}, headers = {}) {
  const cfg = getConfig();
  const openaiKey = (headers['x-openai-api-key'] || requestOverride.openai?.apiKey || cfg.providers.openai.apiKey || '').trim();
  const googleKey = (headers['x-google-api-key'] || requestOverride.google?.apiKey || cfg.providers.google.apiKey || '').trim();

  const openai = {
    provider: 'openai',
    apiKey: openaiKey,
    hasKey: Boolean(openaiKey),
    keySource: headers['x-openai-api-key'] || requestOverride.openai?.apiKey
      ? 'browser'
      : cfg.providers.openai.apiKey
        ? 'server'
        : 'none',
    baseUrl: (requestOverride.openai?.baseUrl || cfg.providers.openai.baseUrl).replace(/\/+$/, ''),
    model: (requestOverride.openai?.model || cfg.providers.openai.defaultModel).trim(),
    reasoningEffort: sanitizeOpenAIEffort(
      requestOverride.openai?.reasoningEffort || cfg.providers.openai.defaultEffort
    ),
    protocol: (requestOverride.openai?.protocol || cfg.providers.openai.defaultProtocol).trim().toLowerCase()
  };

  const google = {
    provider: 'google',
    apiKey: googleKey,
    hasKey: Boolean(googleKey),
    keySource: headers['x-google-api-key'] || requestOverride.google?.apiKey
      ? 'browser'
      : cfg.providers.google.apiKey
        ? 'server'
        : 'none',
    baseUrl: (requestOverride.google?.baseUrl || cfg.providers.google.baseUrl).replace(/\/+$/, ''),
    model: (requestOverride.google?.model || cfg.providers.google.defaultModel).trim(),
    thinkingLevel: sanitizeGoogleThinkingLevel(
      requestOverride.google?.thinkingLevel || cfg.providers.google.defaultEffort
    ),
    protocol: (requestOverride.google?.protocol || cfg.providers.google.defaultProtocol).trim().toLowerCase()
  };

  let mode = String(requestOverride.mode || 'auto').trim().toLowerCase();
  if (!['auto', 'openai', 'google', 'hybrid', 'sandbox'].includes(mode)) {
    mode = 'auto';
  }

  return {
    mode,
    openai,
    google,
    timeoutMs: cfg.requestTimeoutMs
  };
}

/**
 * Pick concrete provider for a given Agent stage according to user mode:
 * - 'openai': always OpenAI gpt-6.2-sol (high)
 * - 'google': always Google gemini-4-neon (high)
 * - 'hybrid': Google gemini-4-neon for creative divergence/mapping + OpenAI gpt-6.2-sol for script architecture & QA
 * - 'sandbox': built-in topic-aware local director engine
 * - 'auto': prefer configured live key (google -> openai), fallback gracefully to sandbox
 */
export function pickStageProvider(gateway, stage) {
  if (gateway.mode === 'sandbox') {
    return { provider: 'sandbox', model: 'sandbox-director-v1', reasoningLevel: 'high', isSandbox: true };
  }

  if (gateway.mode === 'openai') {
    if (!gateway.openai.hasKey) {
      throw new Error('当前已指定 OpenAI（gpt-6.2-sol）通道，但尚未配置 OpenAI API Key。请点击右上角「模型网关」填入 Key，或切换至「演示沙盒」体验。');
    }
    return { ...gateway.openai, reasoningLevel: gateway.openai.reasoningEffort, isSandbox: false };
  }

  if (gateway.mode === 'google') {
    if (!gateway.google.hasKey) {
      throw new Error('当前已指定 Google（gemini-4-neon）通道，但尚未配置 Google Gemini API Key。请点击右上角「模型网关」填入 Key，或切换至「演示沙盒」体验。');
    }
    return { ...gateway.google, reasoningLevel: gateway.google.thinkingLevel, isSandbox: false };
  }

  if (gateway.mode === 'hybrid') {
    const preferGoogle = stage === 'duration_mapper' || stage === 'idea_generator';
    if (preferGoogle && gateway.google.hasKey) {
      return { ...gateway.google, reasoningLevel: gateway.google.thinkingLevel, isSandbox: false };
    }
    if (!preferGoogle && gateway.openai.hasKey) {
      return { ...gateway.openai, reasoningLevel: gateway.openai.reasoningEffort, isSandbox: false };
    }
    if (gateway.google.hasKey) {
      return { ...gateway.google, reasoningLevel: gateway.google.thinkingLevel, isSandbox: false };
    }
    if (gateway.openai.hasKey) {
      return { ...gateway.openai, reasoningLevel: gateway.openai.reasoningEffort, isSandbox: false };
    }
    throw new Error('双模型混编模式需要至少配置 OpenAI 或 Google 其中一个 API Key。');
  }

  // mode === 'auto'
  if (gateway.openai.hasKey) {
    return { ...gateway.openai, reasoningLevel: gateway.openai.reasoningEffort, isSandbox: false };
  }
  if (gateway.google.hasKey) {
    return { ...gateway.google, reasoningLevel: gateway.google.thinkingLevel, isSandbox: false };
  }
  return { provider: 'sandbox', model: 'sandbox-director-v1', reasoningLevel: 'high', isSandbox: true };
}

export async function invokeStructuredStage({
  gateway,
  stage,
  systemPrompt,
  userPrompt,
  sandboxContext = {},
  signal
}) {
  const target = pickStageProvider(gateway, stage);

  if (target.isSandbox) {
    const startedAt = Date.now();
    const res = await runSandboxStage(stage, sandboxContext);
    return {
      data: res.data,
      thoughtSummary: res.thoughtSummary,
      provider: 'sandbox',
      model: 'sandbox-director-v1',
      reasoningLevel: 'high',
      protocol: 'local_sandbox',
      latencyMs: Date.now() - startedAt,
      usage: res.usage,
      isSandbox: true
    };
  }

  const executeCall = async (extraUserNote = '') => {
    const finalUserPrompt = extraUserNote ? `${userPrompt}\n\n${extraUserNote}` : userPrompt;
    if (target.provider === 'openai') {
      return callOpenAI({
        apiKey: target.apiKey,
        baseUrl: target.baseUrl,
        model: target.model,
        reasoningEffort: target.reasoningEffort,
        protocol: target.protocol,
        systemPrompt,
        userPrompt: finalUserPrompt,
        jsonMode: true,
        maxOutputTokens: 32768,
        timeoutMs: gateway.timeoutMs,
        signal
      });
    }
    return callGoogle({
      apiKey: target.apiKey,
      baseUrl: target.baseUrl,
      model: target.model,
      thinkingLevel: target.thinkingLevel,
      protocol: target.protocol,
      systemPrompt,
      userPrompt: finalUserPrompt,
      jsonMode: true,
      maxOutputTokens: 65536,
      timeoutMs: gateway.timeoutMs,
      signal
    });
  };

  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await executeCall(
      attempt === 1
        ? '注意：上一次返回未能解析为严格 JSON，请务必只输出合法的单一 JSON 对象，不要包含任何多余文字。'
        : ''
    );
    try {
      const data = extractJsonObject(raw.text);
      return {
        data,
        thoughtSummary: raw.thoughtSummary || '',
        provider: raw.provider,
        model: raw.model,
        reasoningLevel: raw.reasoningLevel,
        protocol: raw.protocol,
        latencyMs: raw.latencyMs,
        usage: raw.usage,
        isSandbox: false
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('模型未返回有效结构化结果');
}

export async function testProviderGateway(providerId, requestOverride = {}, headers = {}) {
  const gateway = resolveGatewaySettings(requestOverride, headers);
  if (providerId === 'openai') {
    return testOpenAIConnection({
      apiKey: gateway.openai.apiKey,
      baseUrl: gateway.openai.baseUrl,
      model: gateway.openai.model,
      protocol: gateway.openai.protocol
    });
  }
  if (providerId === 'google') {
    return testGoogleConnection({
      apiKey: gateway.google.apiKey,
      baseUrl: gateway.google.baseUrl,
      model: gateway.google.model,
      protocol: gateway.google.protocol
    });
  }
  throw new Error(`不支持检测的模型通道: ${providerId}`);
}

export function getPublicProviderSummary() {
  const cfg = getConfig();
  return {
    openai: {
      id: 'openai',
      label: cfg.providers.openai.label,
      serverKeyConfigured: Boolean(cfg.providers.openai.apiKey),
      baseUrl: cfg.providers.openai.baseUrl,
      defaultModel: cfg.providers.openai.defaultModel,
      defaultEffort: cfg.providers.openai.defaultEffort,
      defaultProtocol: cfg.providers.openai.defaultProtocol,
      allowedEfforts: cfg.providers.openai.allowedEfforts,
      presetModels: cfg.providers.openai.presetModels
    },
    google: {
      id: 'google',
      label: cfg.providers.google.label,
      serverKeyConfigured: Boolean(cfg.providers.google.apiKey),
      baseUrl: cfg.providers.google.baseUrl,
      defaultModel: cfg.providers.google.defaultModel,
      defaultEffort: cfg.providers.google.defaultEffort,
      defaultProtocol: cfg.providers.google.defaultProtocol,
      allowedEfforts: cfg.providers.google.allowedEfforts,
      presetModels: cfg.providers.google.presetModels
    }
  };
}
