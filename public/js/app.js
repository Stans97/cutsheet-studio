import { api, loadGatewayConfig, saveGatewayConfig, DEFAULT_GATEWAY } from './api.js';
import {
  renderHistoryList,
  renderAgentTrace,
  renderDurationPlan,
  renderIdeaCards,
  renderScriptTabs,
  renderScriptDossier,
  formatProviderTag
} from './renderers.js';

const state = {
  guest: null,
  serverProviders: null,
  gateway: loadGatewayConfig(),
  projects: [],
  activeProject: null,
  activeScriptId: null,
  traceSteps: [],
  traceDetailsExpanded: false,
  isRunning: false,
  abortController: null
};

const $ = (id) => document.getElementById(id);

function showToast(message, type = 'default') {
  const stack = $('toast-stack');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 220ms';
    setTimeout(() => el.remove(), 240);
  }, 3400);
}

function getEffectiveProviderStatus() {
  const hasOpenAI = Boolean(state.gateway.openai.apiKey || state.serverProviders?.openai?.serverKeyConfigured);
  const hasGoogle = Boolean(state.gateway.google.apiKey || state.serverProviders?.google?.serverKeyConfigured);
  const mode = state.gateway.mode;

  if (mode === 'sandbox') {
    return { live: false, text: '演示沙盒 · High 模拟' };
  }
  if (mode === 'openai') {
    return {
      live: hasOpenAI,
      text: hasOpenAI
        ? `OpenAI · ${state.gateway.openai.model} · ${state.gateway.openai.reasoningEffort.toUpperCase()}`
        : `OpenAI (${state.gateway.openai.model}) · 待填 Key`
    };
  }
  if (mode === 'google') {
    return {
      live: hasGoogle,
      text: hasGoogle
        ? `Google · ${state.gateway.google.model} · ${state.gateway.google.thinkingLevel.toUpperCase()}`
        : `Google (${state.gateway.google.model}) · 待填 Key`
    };
  }
  if (mode === 'hybrid') {
    return {
      live: hasOpenAI || hasGoogle,
      text: `双模型混编 · ${state.gateway.google.model} + ${state.gateway.openai.model}`
    };
  }
  // auto
  if (hasOpenAI) {
    return {
      live: true,
      text: `OpenAI · ${state.gateway.openai.model} · ${state.gateway.openai.reasoningEffort.toUpperCase()}`
    };
  }
  if (hasGoogle) {
    return {
      live: true,
      text: `Google · ${state.gateway.google.model} · ${state.gateway.google.thinkingLevel.toUpperCase()}`
    };
  }
  return { live: false, text: '演示沙盒 · 可接入 OpenAI / Google' };
}

function syncGatewayUI() {
  const status = getEffectiveProviderStatus();
  const dot = $('gateway-status-dot');
  dot.classList.toggle('live', status.live);
  $('gateway-pill-text').textContent = status.text;

  $('select-route-mode').value = state.gateway.mode;
  $('drawer-route-mode').value = state.gateway.mode;

  // OpenAI drawer fields
  $('openai-api-key').value = state.gateway.openai.apiKey || '';
  $('openai-model').value = state.gateway.openai.model;
  $('openai-effort').value = state.gateway.openai.reasoningEffort;
  $('openai-protocol').value = state.gateway.openai.protocol;
  $('openai-base-url').value = state.gateway.openai.baseUrl;

  const oaStatus = $('openai-key-status');
  if (state.gateway.openai.apiKey) {
    oaStatus.textContent = '浏览器 Key 已就绪';
    oaStatus.className = 'tag tag-ok';
  } else if (state.serverProviders?.openai?.serverKeyConfigured) {
    oaStatus.textContent = '服务端 Key 已就绪';
    oaStatus.className = 'tag tag-ok';
  } else {
    oaStatus.textContent = '未配置 Key';
    oaStatus.className = 'tag tag-warn';
  }

  // Google drawer fields
  $('google-api-key').value = state.gateway.google.apiKey || '';
  $('google-model').value = state.gateway.google.model;
  $('google-effort').value = state.gateway.google.thinkingLevel;
  $('google-protocol').value = state.gateway.google.protocol;
  $('google-base-url').value = state.gateway.google.baseUrl;

  const ggStatus = $('google-key-status');
  if (state.gateway.google.apiKey) {
    ggStatus.textContent = '浏览器 Key 已就绪';
    ggStatus.className = 'tag tag-ok';
  } else if (state.serverProviders?.google?.serverKeyConfigured) {
    ggStatus.textContent = '服务端 Key 已就绪';
    ggStatus.className = 'tag tag-ok';
  } else {
    ggStatus.textContent = '未配置 Key';
    ggStatus.className = 'tag tag-warn';
  }
}

function renderHistory() {
  $('rail-count').textContent = String(state.projects.length);
  $('history-list').innerHTML = renderHistoryList(state.projects, state.activeProject?.id || null);
}

function renderTrace(statusText = null) {
  const panel = $('agent-trace-panel');
  if (!state.traceSteps.length) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');

  const dot = $('trace-dot');
  dot.classList.toggle('running', state.isRunning);
  dot.classList.toggle('live', !state.isRunning);

  if (statusText) {
    $('trace-status-text').textContent = statusText;
  } else {
    $('trace-status-text').textContent = state.isRunning
      ? 'Agent 多阶段推理编排中…'
      : `Agent 编排完成（共 ${state.traceSteps.length} 个阶段）`;
  }

  const { stepsHtml, detailsHtml } = renderAgentTrace(state.traceSteps, state.traceDetailsExpanded);
  $('trace-steps').innerHTML = stepsHtml;
  const detailsEl = $('trace-details');
  detailsEl.innerHTML = detailsHtml;
  detailsEl.classList.toggle('hidden', !state.traceDetailsExpanded);
  $('btn-toggle-trace-details').textContent = state.traceDetailsExpanded
    ? '收起工具与思考详情'
    : '查看工具调用与思考摘要';
}

function renderActiveProject() {
  const proj = state.activeProject;
  const durSec = $('duration-section');
  const ideaSec = $('ideas-section');
  const scrSec = $('script-section');

  if (!proj) {
    durSec.classList.add('hidden');
    ideaSec.classList.add('hidden');
    scrSec.classList.add('hidden');
    return;
  }

  if (proj.durationPlan) {
    durSec.classList.remove('hidden');
    $('duration-content').innerHTML = renderDurationPlan(proj.durationPlan);
    const step1 = state.traceSteps.find((s) => s.stage === 'duration_mapper');
    $('duration-engine-badge').textContent = step1
      ? formatProviderTag(step1.provider, step1.model, step1.reasoningLevel)
      : formatProviderTag(proj.lastProvider || 'sandbox');
  } else {
    durSec.classList.add('hidden');
  }

  if (Array.isArray(proj.ideas) && proj.ideas.length) {
    ideaSec.classList.remove('hidden');
    $('ideas-count-badge').textContent = `(${proj.ideas.length} 个方向)`;
    $('ideas-summary-copy').textContent =
      proj.brief?.creativeDirectionSummary || '点击任意创意卡片即可展开逐镜分镜与现场实拍步骤。';
    $('ideas-grid').innerHTML = renderIdeaCards(proj.ideas, proj.scripts || [], state.activeScriptId);
  } else {
    ideaSec.classList.add('hidden');
  }

  const scripts = proj.scripts || [];
  if (scripts.length) {
    scrSec.classList.remove('hidden');
    const active = scripts.find((s) => s.id === state.activeScriptId) || scripts[0];
    state.activeScriptId = active.id;
    $('script-tabs').innerHTML = renderScriptTabs(scripts, active.id);
    $('script-dossier-container').innerHTML = renderScriptDossier(active);
  } else {
    scrSec.classList.add('hidden');
  }
}

function setRunning(running) {
  state.isRunning = running;
  $('btn-run-agent').disabled = running;
  $('btn-more-ideas').disabled = running;
  $('btn-cancel-run').classList.toggle('hidden', !running);
  $('btn-run-agent').textContent = running ? 'Agent 推理编排中…' : '启动 Agent 策划';
}

function upsertTraceStep(stepPayload) {
  const idx = state.traceSteps.findIndex(
    (s) => s.stage === stepPayload.stage && s.startedAt === stepPayload.startedAt
  );
  if (idx >= 0) {
    state.traceSteps[idx] = { ...state.traceSteps[idx], ...stepPayload };
  } else {
    state.traceSteps.push(stepPayload);
  }
  renderTrace();
}

function attachToolToTrace(stage, tool) {
  for (let i = state.traceSteps.length - 1; i >= 0; i--) {
    if (state.traceSteps[i].stage === stage) {
      const existing = state.traceSteps[i].toolsUsed || [];
      if (!existing.some((t) => t.name === tool.name && t.summary === tool.summary)) {
        state.traceSteps[i].toolsUsed = [...existing, tool];
      }
      break;
    }
  }
  renderTrace();
}

async function refreshProjects() {
  const { projects } = await api.listProjects();
  state.projects = projects || [];
  renderHistory();
}

async function openProject(projectId) {
  try {
    const { project } = await api.getProject(projectId);
    state.activeProject = project;
    state.activeScriptId = project.activeScriptId || project.scripts?.[0]?.id || null;
    const activeScript = project.scripts?.find((s) => s.id === state.activeScriptId);
    state.traceSteps = activeScript?.agentTrace || [];
    $('topic-input').value = project.topic || '';
    $('select-platform').value = project.platform || 'auto';
    renderHistory();
    renderTrace();
    renderActiveProject();
    $('studio-shell').classList.remove('mobile-rail-open');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Core Agent Actions ───────────────────────────────────────

async function handleRunDiscovery() {
  const topic = $('topic-input').value.trim();
  if (topic.length < 2) {
    showToast('请先输入一个想拍的主题或灵感碎片', 'error');
    $('topic-input').focus();
    return;
  }

  state.abortController?.abort();
  state.abortController = new AbortController();
  state.traceSteps = [];
  setRunning(true);
  renderTrace('正在启动主题时长映射与多维创意 Agent…');

  // Create lightweight transient view state so SSE progressive cards appear immediately
  const draftProject = {
    id: null,
    topic,
    platform: $('select-platform').value,
    brief: {
      persona: $('input-persona').value.trim(),
      resources: $('input-resources').value.trim()
    },
    durationPlan: null,
    ideas: [],
    scripts: []
  };
  state.activeProject = draftProject;
  state.activeScriptId = null;
  renderActiveProject();

  try {
    await api.discoverAgent(
      {
        topic,
        platform: $('select-platform').value,
        lockedSeconds: $('select-duration').value ? Number($('select-duration').value) : null,
        persona: $('input-persona').value.trim(),
        resources: $('input-resources').value.trim(),
        ideaCount: Number($('select-idea-count').value) || 6,
        autoExpandTopIdea: $('check-auto-expand').checked
      },
      state.gateway,
      {
        signal: state.abortController.signal,
        onEvent(event, data) {
          if (event === 'agent_step') {
            upsertTraceStep(data);
          } else if (event === 'agent_tool') {
            attachToolToTrace(data.stage, data.tool);
          } else if (event === 'duration_plan') {
            draftProject.durationPlan = data.durationPlan;
            draftProject.lastProvider = data.meta?.provider;
            renderActiveProject();
            $('duration-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else if (event === 'ideas_ready') {
            draftProject.ideas = data.ideas || [];
            draftProject.brief.creativeDirectionSummary = data.creativeDirectionSummary || '';
            renderActiveProject();
          } else if (event === 'done') {
            state.activeProject = data.project;
            state.activeScriptId = data.script?.id || data.project?.activeScriptId || null;
            if (Array.isArray(data.trace)) state.traceSteps = data.trace;
            renderActiveProject();
            renderTrace('策划已完成并自动保存到游客工作区');
          }
        }
      }
    );
    await refreshProjects();
    showToast('Agent 策划完成，已保存至游客工作区', 'ok');
  } catch (err) {
    if (err.name === 'AbortError') {
      renderTrace('已手动停止当前 Agent 运行');
      showToast('已停止当前生成');
    } else {
      renderTrace(`执行失败：${err.message}`);
      showToast(err.message, 'error');
    }
  } finally {
    setRunning(false);
  }
}

async function handleMoreIdeas() {
  if (!state.activeProject?.id || state.isRunning) return;
  state.abortController?.abort();
  state.abortController = new AbortController();
  setRunning(true);
  renderTrace('正在追加发散 4 个全新切口…');

  try {
    await api.moreIdeasAgent(
      state.activeProject.id,
      { count: 4 },
      state.gateway,
      {
        signal: state.abortController.signal,
        onEvent(event, data) {
          if (event === 'agent_step') upsertTraceStep(data);
          if (event === 'done') {
            state.activeProject = data.project;
            renderActiveProject();
          }
        }
      }
    );
    await refreshProjects();
    showToast('已追加 4 个差异化创意方向', 'ok');
  } catch (err) {
    if (err.name !== 'AbortError') showToast(err.message, 'error');
  } finally {
    setRunning(false);
    renderTrace();
  }
}

async function handleExpandIdea(ideaId, overrideSeconds = null, overrideMode = null) {
  if (!state.activeProject?.id || state.isRunning) return;
  state.abortController?.abort();
  state.abortController = new AbortController();
  setRunning(true);
  state.traceSteps = [];
  renderTrace('正在编排逐镜脚本、实拍顺场方案与导演审片…');

  try {
    await api.expandIdeaAgent(
      state.activeProject.id,
      { ideaId, overrideSeconds },
      state.gateway,
      {
        overrideMode,
        signal: state.abortController.signal,
        onEvent(event, data) {
          if (event === 'agent_step') upsertTraceStep(data);
          else if (event === 'agent_tool') attachToolToTrace(data.stage, data.tool);
          else if (event === 'done') {
            state.activeProject = data.project;
            state.activeScriptId = data.script?.id || null;
            if (Array.isArray(data.trace)) state.traceSteps = data.trace;
            renderActiveProject();
            $('script-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }
    );
    await refreshProjects();
    showToast('完整实拍脚本与审片报告已生成', 'ok');
  } catch (err) {
    if (err.name !== 'AbortError') showToast(err.message, 'error');
  } finally {
    setRunning(false);
    renderTrace();
  }
}

async function handleRefineScript(instruction, overrideMode = null) {
  const scriptId = state.activeScriptId;
  if (!scriptId || state.isRunning) return;
  const clean = String(instruction || '').trim();
  if (!clean) {
    showToast('请先输入精修指令', 'error');
    return;
  }

  state.abortController?.abort();
  state.abortController = new AbortController();
  setRunning(true);
  state.traceSteps = [];
  renderTrace(`正在执行导演精修 Agent：「${clean.slice(0, 28)}…」`);

  try {
    await api.refineScriptAgent(
      scriptId,
      { instruction: clean, saveAsNew: true },
      state.gateway,
      {
        overrideMode,
        signal: state.abortController.signal,
        onEvent(event, data) {
          if (event === 'agent_step') upsertTraceStep(data);
          else if (event === 'done') {
            state.activeProject = data.project;
            state.activeScriptId = data.script?.id || null;
            if (Array.isArray(data.trace)) state.traceSteps = data.trace;
            renderActiveProject();
          }
        }
      }
    );
    await refreshProjects();
    showToast('已生成精修对比版本，可在上方标签自由切换', 'ok');
  } catch (err) {
    if (err.name !== 'AbortError') showToast(err.message, 'error');
  } finally {
    setRunning(false);
    renderTrace();
  }
}

// ── Drawer & Modals ──────────────────────────────────────────

function openGatewayDrawer() {
  syncGatewayUI();
  $('drawer-backdrop').classList.add('open');
  $('gateway-drawer').classList.add('open');
}

function closeGatewayDrawer() {
  $('drawer-backdrop').classList.remove('open');
  $('gateway-drawer').classList.remove('open');
}

function collectGatewayFromDrawer() {
  return {
    mode: $('drawer-route-mode').value,
    openai: {
      apiKey: $('openai-api-key').value.trim(),
      baseUrl: $('openai-base-url').value.trim() || DEFAULT_GATEWAY.openai.baseUrl,
      model: $('openai-model').value.trim() || 'gpt-6.2-sol',
      reasoningEffort: $('openai-effort').value || 'high',
      protocol: $('openai-protocol').value || 'responses'
    },
    google: {
      apiKey: $('google-api-key').value.trim(),
      baseUrl: $('google-base-url').value.trim() || DEFAULT_GATEWAY.google.baseUrl,
      model: $('google-model').value.trim() || 'gemini-4-neon',
      thinkingLevel: $('google-effort').value || 'high',
      protocol: $('google-protocol').value || 'generate_content'
    }
  };
}

async function handleTestProvider(providerId) {
  const resultEl = $(`${providerId}-test-result`);
  const btn = $(`btn-test-${providerId}`);
  const draft = collectGatewayFromDrawer();
  resultEl.className = 'test-result show';
  resultEl.textContent = '正在发起低耗探针测试（reasoning/thinking=low）…';
  btn.disabled = true;

  try {
    const res = await api.testProvider(providerId, draft);
    resultEl.className = 'test-result show ok';
    resultEl.textContent = `连接成功 · ${res.model} (${res.protocol}) · 延迟 ${res.latencyMs}ms`;
  } catch (err) {
    resultEl.className = 'test-result show err';
    resultEl.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

function openShotModal(shotIndex) {
  const scripts = state.activeProject?.scripts || [];
  const active = scripts.find((s) => s.id === state.activeScriptId);
  const shot = active?.script?.storyboard?.[shotIndex];
  if (!shot) return;

  $('edit-shot-index').value = String(shotIndex);
  $('shot-modal-title').textContent = `微调镜 #${String(shot.shotNumber || shotIndex + 1).padStart(2, '0')}`;
  $('edit-shot-phase').value = shot.phase || '';
  $('edit-shot-seconds').value = shot.seconds || 6;
  $('edit-shot-size').value = shot.shotSize || '';
  $('edit-shot-move').value = shot.cameraMove || '';
  $('edit-shot-action').value = shot.visualAction || '';
  $('edit-shot-dtype').value = shot.dialogueType || '真人口播';
  $('edit-shot-sound').value = shot.soundDesign || '';
  $('edit-shot-dialogue').value = shot.dialogue || '';
  $('edit-shot-post').value = shot.postTip || '';
  $('shot-modal').classList.add('open');
}

async function handleSaveShotEdit() {
  const idx = Number($('edit-shot-index').value);
  const scriptId = state.activeScriptId;
  if (!scriptId) return;
  try {
    const { script } = await api.patchShot(scriptId, idx, {
      phase: $('edit-shot-phase').value.trim(),
      seconds: Number($('edit-shot-seconds').value),
      shotSize: $('edit-shot-size').value.trim(),
      cameraMove: $('edit-shot-move').value.trim(),
      visualAction: $('edit-shot-action').value.trim(),
      dialogueType: $('edit-shot-dtype').value,
      soundDesign: $('edit-shot-sound').value.trim(),
      dialogue: $('edit-shot-dialogue').value.trim(),
      postTip: $('edit-shot-post').value.trim()
    });
    const list = state.activeProject.scripts || [];
    const pos = list.findIndex((s) => s.id === script.id);
    if (pos >= 0) list[pos] = script;
    $('shot-modal').classList.remove('open');
    renderActiveProject();
    showToast('分镜已更新，时间轴与质检指标已自动重算', 'ok');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Event Binding & Bootstrap ────────────────────────────────

function bindEvents() {
  // Sidebar toggle
  $('btn-toggle-rail').addEventListener('click', () => {
    const shell = $('studio-shell');
    if (window.innerWidth <= 980) {
      shell.classList.toggle('mobile-rail-open');
    } else {
      shell.classList.toggle('rail-collapsed');
    }
  });

  // New topic reset
  const resetComposer = () => {
    state.activeProject = null;
    state.activeScriptId = null;
    state.traceSteps = [];
    $('topic-input').value = '';
    $('select-duration').value = '';
    renderHistory();
    renderTrace();
    renderActiveProject();
    $('topic-input').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  $('btn-new-topic').addEventListener('click', resetComposer);
  $('btn-brand-home').addEventListener('click', resetComposer);

  // Sample topic chips
  document.querySelectorAll('[data-sample]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('topic-input').value = btn.getAttribute('data-sample');
      $('topic-input').focus();
    });
  });

  // Advanced toggle
  $('btn-toggle-advanced').addEventListener('click', () => {
    const box = $('advanced-fields');
    const willOpen = box.classList.contains('hidden');
    box.classList.toggle('hidden', !willOpen);
    $('btn-toggle-advanced').setAttribute('aria-expanded', String(willOpen));
    $('btn-toggle-advanced').querySelector('span').textContent = willOpen
      ? '− 收起人设与拍摄条件补充'
      : '+ 可选补充：账号人设调性、可用器材与预算限制';
  });

  // Route selector in composer syncs with gateway config
  $('select-route-mode').addEventListener('change', (e) => {
    state.gateway.mode = e.target.value;
    saveGatewayConfig(state.gateway);
    syncGatewayUI();
  });

  // Run & Cancel
  $('btn-run-agent').addEventListener('click', handleRunDiscovery);
  $('btn-cancel-run').addEventListener('click', () => state.abortController?.abort());
  $('topic-input').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !state.isRunning) {
      handleRunDiscovery();
    }
  });

  // Trace details toggle
  $('btn-toggle-trace-details').addEventListener('click', () => {
    state.traceDetailsExpanded = !state.traceDetailsExpanded;
    renderTrace();
  });

  // More ideas
  $('btn-more-ideas').addEventListener('click', handleMoreIdeas);

  // History list delegation
  $('history-list').addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-delete-project]');
    if (delBtn) {
      e.stopPropagation();
      const pid = delBtn.getAttribute('data-delete-project');
      await api.deleteProject(pid);
      if (state.activeProject?.id === pid) {
        state.activeProject = null;
        state.activeScriptId = null;
        state.traceSteps = [];
        renderTrace();
        renderActiveProject();
      }
      await refreshProjects();
      showToast('已删除该策划');
      return;
    }
    const item = e.target.closest('[data-project-id]');
    if (item) {
      openProject(item.getAttribute('data-project-id'));
    }
  });

  // Duration remap delegation
  $('duration-content').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remap-seconds]');
    if (!btn || !state.activeProject?.ideas?.length) return;
    const sec = Number(btn.getAttribute('data-remap-seconds'));
    const topIdea = state.activeProject.ideas[0];
    handleExpandIdea(topIdea.id, sec);
  });

  // Idea cards delegation
  $('ideas-grid').addEventListener('click', (e) => {
    const viewBtn = e.target.closest('[data-select-script]');
    if (viewBtn) {
      state.activeScriptId = viewBtn.getAttribute('data-select-script');
      renderActiveProject();
      $('script-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const expandBtn = e.target.closest('[data-expand-idea]');
    if (expandBtn) {
      handleExpandIdea(expandBtn.getAttribute('data-expand-idea'));
    }
  });

  // Script tabs delegation
  $('script-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-select-script]');
    if (!tab) return;
    state.activeScriptId = tab.getAttribute('data-select-script');
    renderActiveProject();
  });

  // Script dossier actions delegation
  $('script-dossier-container').addEventListener('click', async (e) => {
    if (e.target.closest('#btn-print-sheet')) {
      window.print();
      return;
    }
    if (e.target.closest('#btn-copy-md')) {
      try {
        const md = await api.fetchMarkdownExport(state.activeScriptId);
        await navigator.clipboard.writeText(md);
        showToast('完整 Markdown 实拍通告单已复制到剪贴板', 'ok');
      } catch {
        showToast('复制失败，请使用「下载 .md」按钮', 'error');
      }
      return;
    }
    const editBtn = e.target.closest('[data-edit-shot]');
    if (editBtn) {
      openShotModal(Number(editBtn.getAttribute('data-edit-shot')));
      return;
    }
    const quickRefine = e.target.closest('[data-quick-refine]');
    if (quickRefine) {
      handleRefineScript(quickRefine.getAttribute('data-quick-refine'));
      return;
    }
    const rewriteProvider = e.target.closest('[data-rewrite-provider]');
    if (rewriteProvider) {
      const targetProv = rewriteProvider.getAttribute('data-rewrite-provider');
      const label = targetProv === 'openai' ? 'OpenAI gpt-6.2-sol' : 'Google gemini-4-neon';
      handleRefineScript(`保持同一主题与目标片长，以 ${label} 独立导演视角重新优化镜头调度与台词表达，形成高质量对比版本`, targetProv);
      return;
    }
    if (e.target.closest('#btn-submit-refine')) {
      const input = $('refine-instruction-input');
      handleRefineScript(input?.value || '');
    }
  });

  // Gateway drawer controls
  $('btn-open-gateway').addEventListener('click', openGatewayDrawer);
  $('btn-close-gateway').addEventListener('click', closeGatewayDrawer);
  $('drawer-backdrop').addEventListener('click', closeGatewayDrawer);
  $('btn-test-openai').addEventListener('click', () => handleTestProvider('openai'));
  $('btn-test-google').addEventListener('click', () => handleTestProvider('google'));

  $('btn-save-gateway').addEventListener('click', () => {
    state.gateway = collectGatewayFromDrawer();
    saveGatewayConfig(state.gateway);
    syncGatewayUI();
    closeGatewayDrawer();
    showToast('双模型网关配置已保存', 'ok');
  });

  $('btn-clear-keys').addEventListener('click', () => {
    state.gateway.openai.apiKey = '';
    state.gateway.google.apiKey = '';
    saveGatewayConfig(state.gateway);
    syncGatewayUI();
    showToast('已清除浏览器本地保存的 API Key');
  });

  // Guest Workspace Modal
  $('btn-guest-modal').addEventListener('click', () => {
    $('guest-nickname-input').value = state.guest?.nickname || '游客创作者';
    $('guest-token-display').value = state.guest?.id || '';
    $('guest-switch-input').value = '';
    $('guest-modal').classList.add('open');
  });
  $('btn-close-guest-modal').addEventListener('click', () => $('guest-modal').classList.remove('open'));
  $('btn-copy-guest-token').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('guest-token-display').value);
      showToast('工作区口令已复制', 'ok');
    } catch {
      showToast('请手动选中复制口令');
    }
  });
  $('btn-save-guest').addEventListener('click', async () => {
    try {
      const { guest } = await api.updateGuest({ nickname: $('guest-nickname-input').value });
      state.guest = guest;
      $('guest-badge-label').textContent = `游客 · ${guest.nickname}`;
      $('guest-modal').classList.remove('open');
      showToast('游客昵称已更新', 'ok');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  $('btn-switch-guest').addEventListener('click', async () => {
    const token = $('guest-switch-input').value.trim();
    if (!token) return;
    try {
      const { guest } = await api.updateGuest({ switchToken: token });
      state.guest = guest;
      $('guest-badge-label').textContent = `游客 · ${guest.nickname}`;
      $('guest-modal').classList.remove('open');
      state.activeProject = null;
      state.activeScriptId = null;
      await refreshProjects();
      renderActiveProject();
      showToast('已切换至指定游客工作区', 'ok');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Shot Edit Modal
  $('btn-close-shot-modal').addEventListener('click', () => $('shot-modal').classList.remove('open'));
  $('btn-cancel-shot-edit').addEventListener('click', () => $('shot-modal').classList.remove('open'));
  $('btn-save-shot-edit').addEventListener('click', handleSaveShotEdit);
}

async function bootstrap() {
  bindEvents();
  try {
    const { guest, providers } = await api.initGuest();
    state.guest = guest;
    state.serverProviders = providers;
    state.gateway = loadGatewayConfig(providers);
    $('guest-badge-label').textContent = `游客 · ${guest.nickname || '免登录模式'}`;
    syncGatewayUI();
    await refreshProjects();
    if (state.projects.length > 0) {
      await openProject(state.projects[0].id);
    }
  } catch (err) {
    showToast(`初始化失败：${err.message}`, 'error');
  }
}

bootstrap();
