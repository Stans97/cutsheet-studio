const STORAGE_KEY = 'cutsheet_gateway_v1';

export const DEFAULT_GATEWAY = {
  mode: 'auto',
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-6.2-sol',
    reasoningEffort: 'high',
    protocol: 'responses'
  },
  google: {
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-4-neon',
    thinkingLevel: 'high',
    protocol: 'generate_content'
  }
};

export function loadGatewayConfig(serverDefaults = null) {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    saved = {};
  }

  return {
    mode: saved.mode || DEFAULT_GATEWAY.mode,
    openai: {
      apiKey: saved.openai?.apiKey || '',
      baseUrl: saved.openai?.baseUrl || serverDefaults?.openai?.baseUrl || DEFAULT_GATEWAY.openai.baseUrl,
      model: saved.openai?.model || serverDefaults?.openai?.defaultModel || DEFAULT_GATEWAY.openai.model,
      reasoningEffort: saved.openai?.reasoningEffort || serverDefaults?.openai?.defaultEffort || 'high',
      protocol: saved.openai?.protocol || serverDefaults?.openai?.defaultProtocol || 'responses'
    },
    google: {
      apiKey: saved.google?.apiKey || '',
      baseUrl: saved.google?.baseUrl || serverDefaults?.google?.baseUrl || DEFAULT_GATEWAY.google.baseUrl,
      model: saved.google?.model || serverDefaults?.google?.defaultModel || DEFAULT_GATEWAY.google.model,
      thinkingLevel: saved.google?.thinkingLevel || serverDefaults?.google?.defaultEffort || 'high',
      protocol: saved.google?.protocol || serverDefaults?.google?.defaultProtocol || 'generate_content'
    }
  };
}

export function saveGatewayConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function buildGatewayHeaders(gateway, extra = {}) {
  const headers = { ...extra };
  if (gateway?.openai?.apiKey) {
    headers['X-OpenAI-Api-Key'] = gateway.openai.apiKey.trim();
  }
  if (gateway?.google?.apiKey) {
    headers['X-Google-Api-Key'] = gateway.google.apiKey.trim();
  }
  return headers;
}

function sanitizeGatewayForBody(gateway, overrideMode = null) {
  return {
    mode: overrideMode || gateway.mode || 'auto',
    openai: {
      baseUrl: gateway.openai.baseUrl,
      model: gateway.openai.model,
      reasoningEffort: gateway.openai.reasoningEffort,
      protocol: gateway.openai.protocol
    },
    google: {
      baseUrl: gateway.google.baseUrl,
      model: gateway.google.model,
      thinkingLevel: gateway.google.thinkingLevel,
      protocol: gateway.google.protocol
    }
  };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (HTTP ${res.status})`);
  }
  return data;
}

/**
 * Consume a POST Server-Sent Events stream cleanly across arbitrary TCP chunk boundaries.
 */
async function streamSsePost(url, body, gateway, { onEvent, signal, overrideMode = null }) {
  const payload = {
    ...body,
    providerConfig: sanitizeGatewayForBody(gateway, overrideMode)
  };

  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: buildGatewayHeaders(gateway, {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    }),
    body: JSON.stringify(payload),
    signal
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = `请求失败 (HTTP ${res.status})`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error) msg = parsed.error;
    } catch {
      if (errText) msg = errText.slice(0, 200);
    }
    throw new Error(msg);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    const data = await res.json();
    onEvent('done', data);
    return data;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalData = null;

  const dispatchBlock = (block) => {
    const lines = block.split(/\r?\n/);
    let eventName = 'message';
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (!dataLines.length) return;
    let parsed;
    try {
      parsed = JSON.parse(dataLines.join('\n'));
    } catch {
      parsed = { raw: dataLines.join('\n') };
    }
    if (eventName === 'error') {
      throw new Error(parsed.error || 'Agent 执行中断');
    }
    if (eventName === 'done') {
      finalData = parsed;
    }
    onEvent(eventName, parsed);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let splitIndex;
    while ((splitIndex = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, splitIndex).trim();
      buffer = buffer.slice(splitIndex + 2);
      if (block) dispatchBlock(block);
    }
  }
  if (buffer.trim()) {
    dispatchBlock(buffer.trim());
  }

  return finalData;
}

export function apiUrl(relPath) {
  const clean = String(relPath || '').replace(/^\/+/, '');
  const baseHref = window.location.href.endsWith('/') || /\.[a-z0-9]+$/i.test(window.location.pathname)
    ? window.location.href
    : `${window.location.href}/`;
  return new URL(`./${clean}`, baseHref).pathname + new URL(`./${clean}`, baseHref).search;
}

export const api = {
  initGuest() {
    return fetchJson(apiUrl('api/guest'));
  },
  updateGuest(payload) {
    return fetchJson(apiUrl('api/guest'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  listProjects() {
    return fetchJson(apiUrl('api/projects'));
  },
  getProject(id) {
    return fetchJson(apiUrl(`api/projects/${encodeURIComponent(id)}`));
  },
  deleteProject(id) {
    return fetchJson(apiUrl(`api/projects/${encodeURIComponent(id)}`), { method: 'DELETE' });
  },
  deleteScript(id) {
    return fetchJson(apiUrl(`api/scripts/${encodeURIComponent(id)}`), { method: 'DELETE' });
  },
  testProvider(provider, gateway) {
    return fetchJson(apiUrl('api/providers/test'), {
      method: 'POST',
      headers: buildGatewayHeaders(gateway, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        provider,
        providerConfig: sanitizeGatewayForBody(gateway)
      })
    });
  },
  discoverAgent(body, gateway, opts) {
    return streamSsePost(apiUrl('api/agent/discover'), body, gateway, opts);
  },
  moreIdeasAgent(projectId, body, gateway, opts) {
    return streamSsePost(apiUrl(`api/projects/${encodeURIComponent(projectId)}/more-ideas`), body, gateway, opts);
  },
  expandIdeaAgent(projectId, body, gateway, opts) {
    return streamSsePost(apiUrl(`api/projects/${encodeURIComponent(projectId)}/expand`), body, gateway, opts);
  },
  refineScriptAgent(scriptId, body, gateway, opts) {
    return streamSsePost(apiUrl(`api/scripts/${encodeURIComponent(scriptId)}/refine`), body, gateway, opts);
  },
  patchShot(scriptId, shotIndex, patch) {
    return fetchJson(apiUrl(`api/scripts/${encodeURIComponent(scriptId)}/shot`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shotIndex, patch })
    });
  },
  async fetchMarkdownExport(scriptId) {
    const res = await fetch(apiUrl(`api/scripts/${encodeURIComponent(scriptId)}/export?format=md`), {
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('导出失败');
    return res.text();
  }
};
