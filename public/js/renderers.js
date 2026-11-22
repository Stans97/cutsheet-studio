export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatProviderTag(provider, model, level) {
  if (!provider || provider === 'sandbox') return '沙盒';
  const lvl = level ? ` · ${String(level).toUpperCase()}` : '';
  return `${model || provider}${lvl}`;
}

export function renderHistoryList(projects, activeProjectId) {
  if (!projects.length) {
    return '<div class="rail-empty">暂无记录</div>';
  }
  return projects
    .map((p) => {
      const active = p.id === activeProjectId ? 'active' : '';
      const sec = p.targetSeconds ? `${p.targetSeconds}s` : '-';
      const ideaCount = p.ideaCount ?? (p.ideas?.length || 0);
      const scriptCount = p.scriptCount ?? (p.scripts?.length || 0);
      return `
        <div class="history-item ${active}" data-project-id="${escapeHtml(p.id)}" role="button" tabindex="0">
          <div class="history-item-topic">${escapeHtml(p.topic)}</div>
          <div class="history-item-meta mono">
            <span>${escapeHtml(sec)}</span>
            <span>· ${ideaCount} Idea</span>
            <span>· ${scriptCount} 稿</span>
          </div>
          <button type="button" class="history-delete" data-delete-project="${escapeHtml(p.id)}" title="删除">✕</button>
        </div>
      `;
    })
    .join('');
}

export function renderAgentTrace(steps, showDetails) {
  const stepsHtml = steps
    .map((s) => {
      const icon = s.status === 'completed' ? '✓' : s.status === 'error' ? '!' : '◌';
      const meta = [
        s.isSandbox ? 'sandbox' : s.model,
        s.reasoningLevel ? String(s.reasoningLevel).toUpperCase() : '',
        s.latencyMs ? `${(s.latencyMs / 1000).toFixed(1)}s` : ''
      ]
        .filter(Boolean)
        .join(' · ');
      return `
        <div class="trace-step ${escapeHtml(s.status || '')}">
          <div class="trace-step-top">
            <span>${escapeHtml(s.label.replace(/\s*Agent.*$/, ''))}</span>
            <span class="mono">${icon}</span>
          </div>
          <div class="trace-step-meta">${escapeHtml(meta || '…')}</div>
        </div>
      `;
    })
    .join('');

  if (!showDetails) return { stepsHtml, detailsHtml: '' };

  const detailsHtml = steps
    .map((s) => {
      const tools = (s.toolsUsed || [])
        .map((t) => `<div style="margin-top:4px;"><span class="trace-tool-tag">${escapeHtml(t.name)}</span>${escapeHtml(t.summary)}</div>`)
        .join('');
      const thought = s.thoughtSummary ? `<div style="margin-top:4px;">${escapeHtml(s.thoughtSummary)}</div>` : '';
      const tok = s.usage?.totalTokens
        ? `<div class="mono" style="margin-top:4px;font-size:0.72rem;color:var(--ink-muted);">in ${s.usage.inputTokens ?? '-'} / out ${s.usage.outputTokens ?? '-'} / think ${s.usage.reasoningTokens ?? '-'}</div>`
        : '';
      return `<div class="trace-detail-item"><strong>${escapeHtml(s.label)}</strong>${tools}${thought}${tok}</div>`;
    })
    .join('');

  return { stepsHtml, detailsHtml };
}

export function renderDurationPlan(plan) {
  if (!plan) return '';
  const wb = plan.wordBudget || {};
  const curve = Array.isArray(plan.pacingCurve) ? plan.pacingCurve : [];
  const totalPct = curve.reduce((a, c) => a + (Number(c.percent) || 20), 0) || 100;

  const trackBars = curve
    .map(
      (seg) =>
        `<div class="pacing-seg" style="width:${((Number(seg.percent) || 20) / totalPct) * 100}%" title="${escapeHtml(seg.segment)} ${escapeHtml(seg.range)}"></div>`
    )
    .join('');

  const trackLabels = curve
    .map((seg) => `<span class="metric-chip"><strong>${escapeHtml(seg.segment)}</strong> <span class="mono">${escapeHtml(seg.range)}</span></span>`)
    .join('');

  const altChips = (plan.alternatives || [])
    .map(
      (alt) =>
        `<button type="button" class="btn btn-sm" data-remap-seconds="${alt.seconds}">切 ${alt.seconds}s</button>`
    )
    .join('');

  return `
    <div class="duration-card" style="padding:18px 20px;gap:14px;">
      <div class="duration-top" style="gap:18px;align-items:center;">
        <div class="duration-figure-box" style="min-width:118px;padding:12px 16px;">
          <div class="duration-number" style="font-size:2rem;">${escapeHtml(plan.recommendedSeconds)}<span class="duration-unit">s</span></div>
          <div class="duration-cat">${escapeHtml(plan.topicCategory || '')}</div>
        </div>
        <div class="duration-copy" style="gap:8px;">
          <p class="duration-rationale" style="color:var(--ink-primary);">${escapeHtml(plan.rationale)}</p>
          <div class="metrics-row">
            <span class="metric-chip"><strong>${escapeHtml(plan.recommendedShots || 6)} 镜</strong></span>
            <span class="metric-chip">口播 <strong>${escapeHtml(wb.min || 100)}–${escapeHtml(wb.max || 180)} 字</strong></span>
            <span class="metric-chip"><strong>${escapeHtml(wb.charsPerSecond || 3.8)} 字/秒</strong></span>
            ${altChips}
          </div>
        </div>
      </div>
      ${
        curve.length
          ? `<div style="display:flex;flex-direction:column;gap:8px;">
              <div class="pacing-track">${trackBars}</div>
              <div class="metrics-row">${trackLabels}</div>
            </div>`
          : ''
      }
    </div>
  `;
}

export function renderIdeaCards(ideas = [], scripts = [], activeScriptId = null) {
  if (!ideas.length) return '';

  const scriptByIdea = new Map();
  for (const s of scripts || []) {
    if (s.ideaId && !scriptByIdea.has(s.ideaId)) scriptByIdea.set(s.ideaId, s);
  }

  return ideas
    .map((idea) => {
      const existingScript = scriptByIdea.get(idea.id);
      const isSelected = existingScript && existingScript.id === activeScriptId;

      return `
        <article class="idea-card ${isSelected ? 'selected' : ''}" data-idea-id="${escapeHtml(idea.id)}" style="padding:15px 16px;gap:10px;">
          <div class="idea-tags">
            <span class="tag tag-accent">${escapeHtml(idea.archetype)}</span>
            <span class="tag mono">${escapeHtml(idea.mappedSeconds)}s · ${escapeHtml(idea.budgetTier || '轻资产')}</span>
          </div>

          <h3 class="idea-title" style="font-size:1.02rem;">${escapeHtml(idea.title)}</h3>

          ${idea.hook3s ? `<blockquote class="idea-hook" style="margin:0;padding:7px 10px;font-size:0.84rem;">${escapeHtml(idea.hook3s)}</blockquote>` : ''}

          <div class="idea-details" style="gap:4px;font-size:0.82rem;">
            <div class="idea-detail-line"><strong>创意：</strong>${escapeHtml(idea.creativeTwist)}</div>
            <div class="idea-detail-line"><strong>观感：</strong>${escapeHtml(idea.visualMood)}</div>
          </div>

          <div class="idea-foot" style="padding-top:8px;">
            <span class="idea-budget">${escapeHtml(idea.difficulty)}</span>
            <div style="display:flex;gap:6px;">
              ${
                existingScript
                  ? `<button type="button" class="btn btn-sm btn-dark" data-select-script="${escapeHtml(existingScript.id)}">查看</button>
                     <button type="button" class="btn btn-sm" data-expand-idea="${escapeHtml(idea.id)}">重写</button>`
                  : `<button type="button" class="btn btn-sm btn-primary" data-expand-idea="${escapeHtml(idea.id)}">写脚本</button>`
              }
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

export function renderScriptTabs(scripts = [], activeScriptId = null) {
  if (!scripts.length) return '';
  return scripts
    .map((s, idx) => {
      const active = s.id === activeScriptId ? 'active' : '';
      const sec = s.script?.targetSeconds || 45;
      const badge = s.provider === 'sandbox' ? '沙盒' : s.model || s.provider;
      return `
        <button type="button" class="script-tab ${active}" data-select-script="${escapeHtml(s.id)}">
          <span>#${scripts.length - idx} ${escapeHtml((s.title || '脚本').slice(0, 14))}${(s.title || '').length > 14 ? '…' : ''}</span>
          <span class="mono" style="opacity:0.78;font-size:0.73rem;">${sec}s · ${escapeHtml(badge)}</span>
        </button>
      `;
    })
    .join('');
}

export function renderScriptDossier(scriptRecord) {
  if (!scriptRecord || !scriptRecord.script) return '';
  const s = scriptRecord.script;
  const audit = scriptRecord.audit || {};
  const metrics = audit.metrics || {};
  const sum = s.summary || {};
  const vis = s.visualAesthetics || {};
  const prod = s.productionPlan || {};
  const shots = Array.isArray(s.storyboard) ? s.storyboard : [];

  const swatches = (vis.colorPalette || [])
    .map(
      (hex) => `
      <span class="swatch">
        <span class="swatch-dot" style="background:${escapeHtml(hex)}"></span>
        <span>${escapeHtml(hex)}</span>
      </span>
    `
    )
    .join('');

  const storyboardRows = shots
    .map((shot, idx) => {
      const isOnCam = /真人|出镜/.test(String(shot.dialogueType || '')) && !/画外音|VO/i.test(String(shot.dialogueType || ''));
      return `
        <tr>
          <td>
            <span class="shot-num">#${String(shot.shotNumber || idx + 1).padStart(2, '0')}</span>
            <span class="shot-tc" style="display:block;">${escapeHtml(shot.timecode)}</span>
            <span class="shot-phase">${escapeHtml(shot.phase)} · ${escapeHtml(shot.seconds)}s</span>
            <button type="button" class="shot-edit-btn" data-edit-shot="${idx}">微调</button>
          </td>
          <td>
            <strong>${escapeHtml(shot.shotSize)}</strong>
            <div style="color:var(--ink-secondary);">${escapeHtml(shot.cameraMove)}</div>
            <div class="mono" style="font-size:0.72rem;color:var(--ink-muted);">${escapeHtml(shot.sceneGroup || '')}</div>
          </td>
          <td>${escapeHtml(shot.visualAction)}</td>
          <td>
            <span class="dialogue-badge ${isOnCam ? 'oncam' : ''}">${escapeHtml(shot.dialogueType || '口播')}</span>
            <div>${escapeHtml(shot.dialogue)}</div>
          </td>
          <td>
            <div>${escapeHtml(shot.soundDesign)}</div>
            ${shot.postTip ? `<div style="margin-top:4px;font-size:0.78rem;color:var(--ink-muted);">${escapeHtml(shot.postTip)}</div>` : ''}
          </td>
        </tr>
      `;
    })
    .join('');

  const propsHtml = (prod.equipmentAndProps || [])
    .map((item) => `<li><strong>${escapeHtml(item.item)}</strong>（${escapeHtml(item.cost || '自有')}）· ${escapeHtml(item.purpose)}</li>`)
    .join('');

  const shootingOrderHtml = (prod.shootingOrder || [])
    .map(
      (step) => `
      <div class="order-step" style="padding:11px 14px;">
        <div class="order-num">${escapeHtml(step.step)}</div>
        <div>
          <div class="order-title">
            <span>${escapeHtml(step.group)}</span>
            ${step.shotsIncluded ? `<span class="tag mono">${escapeHtml(step.shotsIncluded)}</span>` : ''}
          </div>
          <p class="order-action">${escapeHtml(step.action)}</p>
        </div>
      </div>
    `
    )
    .join('');

  const logicLine = (sum.storyLogicChain || []).join(' → ');

  return `
    <article class="script-dossier">
      <div class="dossier-head" style="padding:20px 24px 16px;gap:10px;">
        <div class="dossier-head-row">
          <div>
            <h3 class="dossier-title">${escapeHtml(s.title)}</h3>
            <p class="dossier-subtitle">${escapeHtml(s.subtitle)}</p>
          </div>
          <div class="export-bar">
            <button type="button" class="btn btn-sm" id="btn-copy-md">复制 MD</button>
            <a class="btn btn-sm" href="./api/scripts/${escapeHtml(scriptRecord.id)}/export?format=md" download>下载 .md</a>
            <button type="button" class="btn btn-sm btn-dark" id="btn-print-sheet">打印</button>
          </div>
        </div>

        <div class="metrics-row">
          <span class="metric-chip"><strong>${escapeHtml(s.aspectRatio || '9:16')}</strong></span>
          <span class="metric-chip"><strong class="mono">${escapeHtml(metrics.actualSeconds || s.targetSeconds)}s · ${shots.length}镜</strong></span>
          <span class="metric-chip"><strong class="mono">${escapeHtml(metrics.dialogueChars ?? '-')}字（${escapeHtml(metrics.charsPerSecond ?? '-')}字/秒）</strong></span>
          <span class="metric-chip">特写空镜 <strong class="mono">${escapeHtml(metrics.brollRatio ?? '-')}%</strong></span>
          <span class="metric-chip">质检 <strong class="mono">${escapeHtml(audit.overallScore || 90)}分</strong></span>
          <span class="metric-chip mono">${escapeHtml(formatProviderTag(scriptRecord.provider, scriptRecord.model, scriptRecord.reasoningLevel))}</span>
        </div>
      </div>

      <div class="dossier-body" style="padding:22px 24px;gap:24px;">
        <!-- 1. 创意、逻辑与观感（紧凑一屏） -->
        <section id="block-logic" class="dossier-block" style="gap:10px;">
          <h4 class="block-heading">一、创意、逻辑与观感</h4>
          ${sum.openingHook ? `<blockquote class="idea-hook" style="margin:0;"><strong>前3秒钩子：</strong>${escapeHtml(sum.openingHook)}</blockquote>` : ''}
          <div class="two-col">
            <div class="info-panel" style="padding:13px 15px;">
              <h4>创意与逻辑</h4>
              ${logicLine ? `<p style="font-size:0.86rem;color:var(--ink-primary);font-weight:500;">${escapeHtml(logicLine)}</p>` : ''}
              <ul class="clean-list" style="font-size:0.86rem;">
                ${(sum.creativePoints || []).slice(0, 3).map((pt) => `<li>${escapeHtml(pt)}</li>`).join('')}
              </ul>
              ${(sum.titleOptions || []).length > 1 ? `<div style="font-size:0.8rem;color:var(--ink-muted);margin-top:4px;">备选标题：${escapeHtml(sum.titleOptions.slice(0, 3).join(' / '))}</div>` : ''}
            </div>
            <div class="info-panel" style="padding:13px 15px;">
              <h4>视觉观感与声景</h4>
              <p style="font-size:0.87rem;color:var(--ink-primary);font-weight:500;">${escapeHtml(vis.lookAndFeel)}</p>
              <div class="palette-row">${swatches}</div>
              <div style="font-size:0.84rem;color:var(--ink-secondary);"><strong>布光：</strong>${escapeHtml(vis.lightingPlan)}</div>
              <div style="font-size:0.84rem;color:var(--ink-secondary);"><strong>机位：</strong>${escapeHtml(vis.cameraStyle)}</div>
              <div style="font-size:0.84rem;color:var(--ink-secondary);"><strong>声音：</strong>${escapeHtml(vis.soundDesign)}</div>
            </div>
          </div>
        </section>

        <!-- 2. 逐镜分镜脚本表 -->
        <section id="block-storyboard" class="dossier-block" style="gap:10px;">
          <h4 class="block-heading">
            <span>二、逐镜分镜（${shots.length} 镜）</span>
            <span class="mono" style="font-size:0.75rem;color:var(--ink-muted);">点「微调」实时重算时间轴</span>
          </h4>
          <div class="storyboard-wrap">
            <table class="storyboard-table">
              <thead>
                <tr>
                  <th style="width:105px;">镜号/时间</th>
                  <th style="width:145px;">景别与运镜</th>
                  <th style="width:230px;">画面动作</th>
                  <th style="width:240px;">台词（口播 / VO）</th>
                  <th style="width:175px;">音效 / 后期</th>
                </tr>
              </thead>
              <tbody>${storyboardRows}</tbody>
            </table>
          </div>
        </section>

        <!-- 3. 顺场拍摄步骤与执行清单 -->
        <section id="block-production" class="dossier-block" style="gap:12px;">
          <h4 class="block-heading">
            <span>三、实拍步骤与方案</span>
            <span class="mono" style="font-size:0.76rem;color:var(--ink-muted);">${escapeHtml(prod.estimatedPrepTime || '')} · ${escapeHtml(prod.estimatedBudget || '')}</span>
          </h4>

          <div class="order-list">${shootingOrderHtml}</div>

          <div class="two-col">
            <div class="info-panel" style="padding:13px 15px;">
              <h4>道具与场地（${escapeHtml(prod.locationSuggestion || '轻资产')}）</h4>
              <ul class="clean-list" style="font-size:0.85rem;">${propsHtml}</ul>
            </div>
            <div class="info-panel" style="padding:13px 15px;">
              <h4>剪辑与避坑</h4>
              <ul class="clean-list" style="font-size:0.85rem;">
                ${(prod.postProductionSteps || []).slice(0, 3).map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
                ${(prod.antiNgTips || []).slice(0, 2).map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
                ${(audit.risks || []).slice(0, 1).map((r) => `<li style="color:var(--warn);"><strong>注意：</strong>${escapeHtml(r)}</li>`).join('')}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <!-- 精修指令栏 -->
      <div class="refine-box" style="padding:16px 24px 20px;">
        <div class="sample-strip">
          <button type="button" class="sample-chip" data-quick-refine="压缩成 30 秒高密版">压成 30s</button>
          <button type="button" class="sample-chip" data-quick-refine="改成单人手机低成本可拍方案">单人手机拍</button>
          <button type="button" class="sample-chip" data-quick-refine="强化前 3 秒冲突反常识钩子">加强前3秒钩子</button>
          <button type="button" class="sample-chip" data-rewrite-provider="openai">用 GPT-6.2 Sol 重写</button>
          <button type="button" class="sample-chip" data-rewrite-provider="google">用 Gemini 4 Neon 重写</button>
        </div>

        <div class="refine-form">
          <input id="refine-instruction-input" class="input refine-input" type="text" placeholder="输入精修指令（如：改成黑金暗调桌面微距，总长 60 秒）" />
          <button id="btn-submit-refine" class="btn btn-primary" type="button">精修</button>
        </div>
      </div>
    </article>
  `;
}
