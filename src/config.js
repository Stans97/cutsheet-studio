import fs from 'node:fs';
import path from 'node:path';

/**
 * Lightweight zero-dependency .env loader.
 * Does not override already-present process.env variables.
 */
function loadDotEnvFiles(rootDir) {
  for (const filename of ['.env', '.env.local']) {
    const filePath = path.join(rootDir, filename);
    if (!fs.existsSync(filePath)) continue;
    let raw = '';
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

export const ROOT_DIR = path.resolve(new URL('..', import.meta.url).pathname);
loadDotEnvFiles(ROOT_DIR);

export const OPENAI_ALLOWED_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const GOOGLE_ALLOWED_LEVELS = ['low', 'medium', 'high', 'xhigh'];

export function sanitizeOpenAIEffort(effort) {
  const normalized = String(effort || 'high').trim().toLowerCase();
  if (OPENAI_ALLOWED_EFFORTS.includes(normalized)) return normalized;
  if (normalized === 'none' || normalized === 'minimal') return 'low';
  return 'high';
}

export function sanitizeGoogleThinkingLevel(level) {
  const normalized = String(level || 'high').trim().toLowerCase();
  if (GOOGLE_ALLOWED_LEVELS.includes(normalized)) return normalized;
  if (normalized === 'minimal' || normalized === 'none') return 'low';
  if (normalized === 'max') return 'xhigh';
  return 'high';
}

export function normalizeBasePath(raw = '') {
  const trimmed = String(raw || '').trim();
  if (!trimmed || trimmed === '/') return '';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

export function getConfig() {
  const dataDir = path.resolve(ROOT_DIR, process.env.DATA_DIR || './data');
  const basePath = normalizeBasePath(process.env.BASE_PATH || '');
  const cookiePath = (process.env.COOKIE_PATH || (basePath ? `${basePath}/` : '/')).trim() || '/';
  return {
    port: Number(process.env.PORT || 3780),
    host: process.env.HOST || '0.0.0.0',
    basePath,
    cookiePath,
    dataDir,
    requestTimeoutMs: Math.max(30_000, Number(process.env.REQUEST_TIMEOUT_MS || 900_000)),
    providers: {
      openai: {
        id: 'openai',
        label: 'OpenAI',
        apiKey: (process.env.OPENAI_API_KEY || '').trim(),
        baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
        defaultModel: (process.env.OPENAI_MODEL || 'gpt-6.2-sol').trim(),
        defaultEffort: sanitizeOpenAIEffort(process.env.OPENAI_REASONING_EFFORT || 'high'),
        defaultProtocol: (process.env.OPENAI_PROTOCOL || 'responses').trim().toLowerCase(),
        allowedEfforts: OPENAI_ALLOWED_EFFORTS,
        presetModels: [
          { id: 'gpt-6.2-sol', name: 'GPT-6.2 Sol（默认推荐）', note: '1.05M 上下文 · 高性价比推理与 Agent 编排' },
          { id: 'gpt-6.2-astra', name: 'GPT-6.2 Astra', note: '旗舰深度推理模型，适合复杂叙事专题' },
          { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', note: '轻量快速模型，适合高频批量出稿' }
        ]
      },
      google: {
        id: 'google',
        label: 'Google Gemini',
        apiKey: (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim(),
        baseUrl: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, ''),
        defaultModel: (process.env.GEMINI_MODEL || 'gemini-4-neon').trim(),
        defaultEffort: sanitizeGoogleThinkingLevel(process.env.GEMINI_THINKING_LEVEL || 'high'),
        defaultProtocol: (process.env.GEMINI_PROTOCOL || 'generate_content').trim().toLowerCase(),
        allowedEfforts: GOOGLE_ALLOWED_LEVELS,
        presetModels: [
          { id: 'gemini-4-neon', name: 'Gemini 4 Neon（默认推荐）', note: '1M 上下文 · 默认 High 深度思考 · Agent 编排利器' },
          { id: 'gemini-4-argon', name: 'Gemini 4 Argon', note: '旗舰影视/多模态强推理模型' },
          { id: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen', note: '高速高性价比推理模型' },
          { id: 'gemini-4-carbon', name: 'Gemini 4 Carbon', note: '均衡型分析与创作模型' }
        ]
      }
    }
  };
}
