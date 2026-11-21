export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatProviderTag(provider, model, level) {
  if (!provider || provider === 'sandbox') {
    return '演示沙盒 · High 模拟';
  }
  const pLabel = provider === 'openai' ? 'OpenAI' : provider === 'google' ? 'Google' : provider;
  const lvl = level ? ` · ${String(level).toUpperCase()}` : '';
  return `${pLabel} · ${model || ''}${lvl}`;
}

export function renderHistoryList(projects, activeProjectId) {
  if (!projects.length) {
    return `
      <div class="rail-empty">
        还没有保存的策划。<br />
        输入主题后，每次时长映射、创意矩阵与实拍脚本都会自动保存到当前游客工作区。
      </div>
    `;
  }

  return projects
    .map((p) => {
      const active = p.id === activeProjectId ? 'active' : '';
      const sec = p.targetSeconds ? `${p.targetSeconds}s` : '待定';
      const ideaCount = p.ideaCount ?? (p.ideas?.length || 0);
      const scriptCount = p.scriptCount ?? (p.scripts?.length || 0);
      return `
        <div class="history-item ${active}" data-project-id="${escapeHtml(p.id)}" role="button" tabindex="0">
          <div class="history-item-topic">${escapeHtml(p.topic)}</div>
          <div class="history-item-meta mono">
            <span>${escapeHtml(sec)}</span>
            <span>· ${ideaCount} Idea</span>
            <span>· ${scriptCount} 脚本</span>
          </div>
          <button type="button" class="history-delete" data-delete-project="${escapeHtml(p.id)}" title="删除此策划" aria-label="删除策划">✕</button>
        </div>
      `;
    })
    .join('');
}

export function renderAgentTrace(steps, showDetails) {
  const stepsHtml = steps
    .map((s) => {
      const icon = s.status === 'completed' ? '✓' : s.status === 'error' ? '!' : '◌';
      const metaParts = [];
      if (s.model) metaParts.push(s.isSandbox ? 'sandbox' : s.model);
      if (s.reasoningLevel) metaParts.push(String(s.reasoningLevel).toUpperCase());
      if (s.latencyMs) metaParts.push(`${(s.latencyMs / 1000).toFixed(1)}s`);
      if (s.usage?.reasoningTokens) metaParts.push(`思考 ${s.usage.reasoningTokens} tok`);
      return `
        <div class="trace-step ${escapeHtml(s.status || '')}">
          <div class="trace-step-top">
            <span>${escapeHtml(s.label)}</span>
            <span class="mono">${icon}</span>
          </div>
          <div class="trace-step-meta">${escapeHtml(metaParts.join(' · ') || '调度中…')}</div>
        </div>
      `;
    })
    .join('');

  if (!showDetails) {
    return { stepsHtml, detailsHtml: '' };
  }

  const detailsHtml = steps
    .map((s) => {
      const tools = (s.toolsUsed || [])
        .map(
          (t) =>
            `<div style="margin-top:4px;"><span class="trace-tool-tag">TOOL · ${escapeHtml(t.name)}</span><span>${escapeHtml(t.summary)}</span></div>`
        )
        .join('');
      const thought = s.thoughtSummary
        ? `<div style="margin-top:6px;color:var(--ink-secondary);"><strong>思考摘要：</strong>${escapeHtml(s.thoughtSummary)}</div>`
        : '';
      const usage = s.usage?.totalTokens
        ? `<div class="mono" style="margin-top:5px;font-size:0.74rem;color:var(--ink-muted);">Tokens: 输入 ${s.usage.inputTokens ?? '-'} / 输出 ${s.usage.outputTokens ?? '-'} / 思考 ${s.usage.reasoningTokens ?? '-'} / 合计 ${s.usage.totalTokens}</div>`
        : '';
      return `
        <div class="trace-detail-item">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <strong>${escapeHtml(s.label)}</strong>
            <span class="mono" style="font-size:0.74rem;color:var(--ink-muted);">${escapeHtml(formatProviderTag(s.provider, s.model, s.reasoningLevel))}</span>
          </div>
          ${tools}
          ${thought}
          ${usage}
        </div>
      `;
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
        `<div class="pacing-seg" style="width:${((Number(seg.percent) || 20) / totalPct) * 100}%" title="${escapeHtml(seg.segment)} (${escapeHtml(seg.range)})"></div>`
    )
    .join('');

  const trackLegend = curve
    .map(
      (seg) => `
      <div class="pacing-legend-item">
        <div class="pacing-legend-top">
          <span>${escapeHtml(seg.segment)}</span>
          <span class="mono" style="color:var(--accent);font-size:0.75rem;">${escapeHtml(seg.range)}</span>
        </div>
        <div style="color:var(--ink-muted);">${escapeHtml(seg.goal)}</div>
      </div>
    `
    )
    .join('');

  const altChips = (plan.alternatives || [])
    .map(
      (alt) => `
      <button type="button" class="btn btn-sm" data-remap-seconds="${alt.seconds}" title="${escapeHtml(alt.useCase)}">
        <span class="mono">${alt.seconds}s</span> · ${escapeHtml(alt.label.replace(/^\d+秒\s*[·\-]?\s*/, ''))}
      </button>
    `
    )
    .join('');

  return `
    <div class="duration-card">
      <div class="duration-top">
        <div class="duration-figure-box">
          <div class="duration-number">${escapeHtml(plan.recommendedSeconds)}<span class="duration-unit">s</span></div>
          <div class="duration-cat">${escapeHtml(plan.topicCategory || '推荐片长')}</div>
        </div>

        <div class="duration-copy">
          <div class="duration-label-title">${escapeHtml(plan.durationLabel)}</div>
          <p class="duration-rationale">${escapeHtml(plan.rationale)}</p>
          ${plan.platformAdvice ? `<p style="font-size:0.84rem;color:var(--ink-muted);">平台策略：${escapeHtml(plan.platformAdvice)}</p>` : ''}
          <div class="metrics-row">
            <span class="metric-chip">建议镜头 <strong>${escapeHtml(plan.recommendedShots || 6)} 镜</strong></span>
            <span class="metric-chip">安全口播 <strong>${escapeHtml(wb.min || 100)}–${escapeHtml(wb.max || 180)} 字</strong>（理想 ${escapeHtml(wb.ideal || 150)} 字）</span>
            <span class="metric-chip">语速控制 <strong>${escapeHtml(wb.charsPerSecond || 3.8)} 字/秒</strong></span>
            <span class="metric-chip">声画呼吸留白 <strong>${escapeHtml(wb.breathReserveSeconds || 5)}s</strong></span>
          </div>
        </div>
      </div>

      ${
        curve.length
          ? `
        <div>
          <div class="field-label" style="margin-bottom:7px;">节奏曲线分配</div>
          <div class="pacing-track">${trackBars}</div>
          <div class="pacing-legend">${trackLegend}</div>
        </div>
      `
          : ''
      }

      ${
        altChips
          ? `
        <div class="alt-durations">
          <span class="sample-label">想切换片长？点击直接按备选时长展开当前首选创意：</span>
          ${altChips}
        </div>
      `
          : ''
      }
    </div>
  `;
}

export function renderIdeaCards(ideas = [], scripts = [], activeScriptId = null) {
  if (!ideas.length) return '';

  const scriptByIdea = new Map();
  for (const s of scripts || []) {
    if (s.ideaId && !scriptByIdea.has(s.ideaId)) {
      scriptByIdea.set(s.ideaId, s);
    }
  }

  return ideas
    .map((idea) => {
      const existingScript = scriptByIdea.get(idea.id);
      const isSelected = existingScript && existingScript.id === activeScriptId;

      return `
        <article class="idea-card ${isSelected ? 'selected' : ''}" data-idea-id="${escapeHtml(idea.id)}">
          <div class="idea-tags">
            <span class="tag tag-accent">${escapeHtml(idea.archetype)}</span>
            <span class="tag mono">${escapeHtml(idea.mappedSeconds)}s · ${escapeHtml(idea.platformFit)}</span>
          </div>

          <h3 class="idea-title">${escapeHtml(idea.title)}</h3>

          ${idea.hook3s ? `<blockquote class="idea-hook" style="margin:0;">${escapeHtml(idea.hook3s)}</blockquote>` : ''}

          <div class="idea-details">
            <div class="idea-detail-line"><strong>创意切口：</strong>${escapeHtml(idea.creativeTwist)}</div>
            <div class="idea-detail-line"><strong>视觉观感：</strong>${escapeHtml(idea.visualMood)}</div>
            ${idea.logicHighlight ? `<div class="idea-detail-line"><strong>逻辑推进：</strong>${escapeHtml(idea.logicHighlight)}</div>` : ''}
            ${idea.viralPotential ? `<div class="idea-detail-line"><strong>传播亮点：</strong>${escapeHtml(idea.viralPotential)}</div>` : ''}
          </div>

          <div class="idea-foot">
            <span class="idea-budget">${escapeHtml(idea.difficulty)} · ${escapeHtml(idea.budgetTier)}</span>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              ${
                existingScript
                  ? `<button type="button" class="btn btn-sm btn-dark" data-select-script="${escapeHtml(existingScript.id)}">查看脚本</button>
                     <button type="button" class="btn btn-sm" data-expand-idea="${escapeHtml(idea.id)}" title="重新生成或用另一模型再写一版">再写一版</button>`
                  : `<button type="button" class="btn btn-sm btn-primary" data-expand-idea="${escapeHtml(idea.id)}">生成完整脚本</button>`
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
          <span>#${scripts.length - idx} ${escapeHtml((s.title || '未命名脚本').slice(0, 18))}${(s.title || '').length > 18 ? '…' : ''}</span>
          <span class="mono" style="opacity:0.78;font-size:0.74rem;">${sec}s · ${escapeHtml(badge)}</span>
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
            <span class="shot-phase">${escapeHtml(shot.phase)}</span>
            <button type="button" class="shot-edit-btn" data-edit-shot="${idx}">微调</button>
          </td>
          <td>
            <span class="shot-tc">${escapeHtml(shot.timecode)}</span>
            <span class="shot-sec">${escapeHtml(shot.seconds)}s</span>
          </td>
          <td>
            <div><strong>${escapeHtml(shot.shotSize)}</strong></div>
            <div style="color:var(--ink-secondary);margin-top:2px;">${escapeHtml(shot.cameraMove)}</div>
            <div class="mono" style="font-size:0.72rem;color:var(--ink-muted);margin-top:4px;">${escapeHtml(shot.sceneGroup || '')}</div>
          </td>
          <td>${escapeHtml(shot.visualAction)}</td>
          <td>
            <span class="dialogue-badge ${isOnCam ? 'oncam' : ''}">${escapeHtml(shot.dialogueType || '口播')}</span>
            <div>${escapeHtml(shot.dialogue)}</div>
          </td>
          <td>
            <div>${escapeHtml(shot.soundDesign)}</div>
            ${shot.postTip ? `<div style="margin-top:6px;font-size:0.78rem;color:var(--ink-muted);"><strong>后期：</strong>${escapeHtml(shot.postTip)}</div>` : ''}
          </td>
        </tr>
      `;
    })
    .join('');

  const propsHtml = (prod.equipmentAndProps || [])
    .map(
      (item) => `
      <li>
        <strong>${escapeHtml(item.item)}</strong>
        <span class="tag mono" style="margin:0 4px;">${escapeHtml(item.cost || '自有')}</span>
        <span>${escapeHtml(item.purpose)}</span>
      </li>
    `
    )
    .join('');

  const shootingOrderHtml = (prod.shootingOrder || [])
    .map(
      (step) => `
      <div class="order-step">
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

  const optChips = (audit.optimizationSuggestions || [])
    .map(
      (sug) =>
        `<button type="button" class="sample-chip" data-quick-refine="${escapeHtml(sug)}">↗ ${escapeHtml(sug.slice(0, 44))}${sug.length > 44 ? '…' : ''}</button>`
    )
    .join('');

  return `
    <article class="script-dossier">
      <!-- Dossier Header -->
      <div class="dossier-head">
        <div class="dossier-head-row">
          <div>
            <h3 class="dossier-title">${escapeHtml(s.title)}</h3>
            <p class="dossier-subtitle">${escapeHtml(s.subtitle)}</p>
          </div>
          <div class="export-bar">
            <button type="button" class="btn btn-sm" id="btn-copy-md">复制 Markdown</button>
            <a class="btn btn-sm" href="./api/scripts/${escapeHtml(scriptRecord.id)}/export?format=md" download>下载 .md</a>
            <a class="btn btn-sm" href="./api/scripts/${escapeHtml(scriptRecord.id)}/export?format=json" download>导出 .json</a>
            <button type="button" class="btn btn-sm btn-dark" id="btn-print-sheet">打印分镜通告单</button>
          </div>
        </div>

        <div class="metrics-row">
          <span class="metric-chip">画幅 <strong>${escapeHtml(s.aspectRatio || '9:16')}</strong></span>
          <span class="metric-chip">总时长 <strong class="mono">${escapeHtml(metrics.actualSeconds || s.targetSeconds)}s</strong></span>
          <span class="metric-chip">分镜数 <strong class="mono">${shots.length} 镜</strong></span>
          <span class="metric-chip">口播字数 <strong class="mono">${escapeHtml(metrics.dialogueChars ?? '-')} 字（${escapeHtml(metrics.charsPerSecond ?? '-')} 字/秒）</strong></span>
          <span class="metric-chip">特写/空镜占比 <strong class="mono">${escapeHtml(metrics.brollRatio ?? '-')}%</strong></span>
          <span class="metric-chip mono">${escapeHtml(formatProviderTag(scriptRecord.provider, scriptRecord.model, scriptRecord.reasoningLevel))}</span>
        </div>
      </div>

      <!-- Sticky Jump Nav -->
      <nav class="dossier-nav" aria-label="脚本章节导航">
        <a class="dossier-nav-link" href="#block-logic">一、创意与逻辑</a>
        <a class="dossier-nav-link" href="#block-visual">二、视觉观感与声景</a>
        <a class="dossier-nav-link" href="#block-storyboard">三、逐镜分镜表（${shots.length}镜）</a>
        <a class="dossier-nav-link" href="#block-production">四、实拍步骤与方案</a>
        <a class="dossier-nav-link" href="#block-audit">五、导演审片质检</a>
      </nav>

      <!-- Dossier Body -->
      <div class="dossier-body">
        <!-- 1. Creative Concept & Logic -->
        <section id="block-logic" class="dossier-block">
          <h4 class="block-heading">一、创意点与叙事逻辑</h4>
          ${sum.openingHook ? `<blockquote class="idea-hook" style="margin:0;font-size:0.95rem;"><strong>前 3 秒黄金钩子：</strong>${escapeHtml(sum.openingHook)}</blockquote>` : ''}
          <div class="two-col">
            <div class="info-panel">
              <h4>核心命题与创意亮点</h4>
              ${sum.coreThesis ? `<p style="font-size:0.9rem;color:var(--ink-primary);">${escapeHtml(sum.coreThesis)}</p>` : ''}
              <ul class="clean-list">
                ${(sum.creativePoints || []).map((pt) => `<li>${escapeHtml(pt)}</li>`).join('')}
              </ul>
            </div>
            <div class="info-panel">
              <h4>叙事逻辑推进链</h4>
              <ul class="clean-list">
                ${(sum.storyLogicChain || []).map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
              </ul>
            </div>
          </div>
          <div class="two-col">
            <div class="info-panel">
              <h4>备选爆款标题与封面方案</h4>
              <ul class="clean-list">
                ${(sum.titleOptions || []).map((t) => `<li><strong>${escapeHtml(t)}</strong></li>`).join('')}
              </ul>
              ${sum.coverConcept ? `<p style="margin-top:6px;font-size:0.85rem;color:var(--ink-secondary);"><strong>封面构图：</strong>${escapeHtml(sum.coverConcept)}</p>` : ''}
            </div>
            <div class="info-panel">
              <h4>留存、收藏与转发诱因</h4>
              <ul class="clean-list">
                ${(sum.shareTriggers || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
              </ul>
            </div>
          </div>
        </section>

        <!-- 2. Visual Aesthetics & Sound -->
        <section id="block-visual" class="dossier-block">
          <h4 class="block-heading">二、视觉观感与声景设定</h4>
          <div class="info-panel">
            <h4>整体观感与影调色卡</h4>
            <p style="font-size:0.94rem;color:var(--ink-primary);font-weight:500;">${escapeHtml(vis.lookAndFeel)}</p>
            <div class="palette-row" style="margin-top:6px;">${swatches}</div>
          </div>
          <div class="two-col">
            <div class="info-panel">
              <h4>布光与机位美学</h4>
              <p style="font-size:0.88rem;color:var(--ink-secondary);"><strong>布光方案：</strong>${escapeHtml(vis.lightingPlan)}</p>
              <p style="font-size:0.88rem;color:var(--ink-secondary);"><strong>焦段运镜：</strong>${escapeHtml(vis.cameraStyle)}</p>
            </div>
            <div class="info-panel">
              <h4>收音、物理同期声与后期包装</h4>
              <p style="font-size:0.88rem;color:var(--ink-secondary);"><strong>声音设计：</strong>${escapeHtml(vis.soundDesign)}</p>
              <p style="font-size:0.88rem;color:var(--ink-secondary);"><strong>字幕包装：</strong>${escapeHtml(vis.subtitleAndPackaging)}</p>
            </div>
          </div>
        </section>

        <!-- 3. Shot-by-Shot Storyboard -->
        <section id="block-storyboard" class="dossier-block">
          <h4 class="block-heading">
            <span>三、逐镜分镜脚本表</span>
            <span class="mono" style="font-size:0.78rem;font-weight:500;color:var(--ink-muted);">点击任意镜号「微调」可实时修改并重算时间轴</span>
          </h4>
          <div class="storyboard-wrap">
            <table class="storyboard-table">
              <thead>
                <tr>
                  <th style="width:92px;">镜号/段落</th>
                  <th style="width:96px;">时间轴</th>
                  <th style="width:155px;">景别与运镜</th>
                  <th style="width:230px;">画面与动作调度</th>
                  <th style="width:235px;">台词（口播 / VO）</th>
                  <th style="width:185px;">同期声与后期</th>
                </tr>
              </thead>
              <tbody>${storyboardRows}</tbody>
            </table>
          </div>
        </section>

        <!-- 4. Production Plan & Shooting Steps -->
        <section id="block-production" class="dossier-block">
          <h4 class="block-heading">四、拍摄步骤与现场执行方案</h4>
          <div class="metrics-row">
            <span class="metric-chip">耗时预估 <strong>${escapeHtml(prod.estimatedPrepTime || '-')}</strong></span>
            <span class="metric-chip">预算分级 <strong>${escapeHtml(prod.estimatedBudget || '-')}</strong></span>
            <span class="metric-chip">场地建议 <strong>${escapeHtml(prod.locationSuggestion || '-')}</strong></span>
          </div>

          <div class="info-panel">
            <h4>器材与低成本道具清单</h4>
            <ul class="clean-list">${propsHtml}</ul>
          </div>

          <div>
            <div class="field-label" style="margin-bottom:8px;">现场顺场实拍步骤（按机位/灯光合并，告别按剧情来回拆灯）</div>
            <div class="order-list">${shootingOrderHtml}</div>
          </div>

          <div class="two-col">
            <div class="info-panel">
              <h4>现场提词与降 NG 技巧</h4>
              <ul class="clean-list">
                ${(prod.antiNgTips || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
              </ul>
            </div>
            <div class="info-panel">
              <h4>后期剪辑 5 步走</h4>
              <ul class="clean-list">
                ${(prod.postProductionSteps || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
              </ul>
            </div>
          </div>
        </section>

        <!-- 5. Director QA Audit -->
        <section id="block-audit" class="dossier-block">
          <h4 class="block-heading">五、导演审片与可拍性质检</h4>
          <div class="audit-banner">
            <div class="audit-score-ring ${(audit.overallScore || 90) < 82 ? 'warn' : ''}">
              <span class="audit-score-val">${escapeHtml(audit.overallScore || 90)}</span>
              <span class="audit-score-sub">可拍评分</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <div style="font-weight:700;font-size:1rem;">${escapeHtml(audit.verdict || '可直接进场开拍')}</div>
              <div class="two-col">
                <div>
                  <div class="field-label" style="margin-bottom:4px;color:var(--ok);">核心亮点</div>
                  <ul class="clean-list" style="font-size:0.84rem;">
                    ${(audit.strengths || []).map((sItem) => `<li>${escapeHtml(sItem)}</li>`).join('')}
                  </ul>
                </div>
                <div>
                  <div class="field-label" style="margin-bottom:4px;color:var(--warn);">实拍风险与提醒</div>
                  <ul class="clean-list" style="font-size:0.84rem;">
                    ${(audit.risks || []).map((rItem) => `<li>${escapeHtml(rItem)}</li>`).join('')}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Inline Agent Refinement Bar -->
      <div class="refine-box">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <strong style="font-size:0.9rem;">继续让 Agent 精修或换模型对比</strong>
          <span style="font-size:0.78rem;color:var(--ink-muted);">精修将保留当前版本并新增一个对比标签页</span>
        </div>

        <div class="sample-strip">
          <button type="button" class="sample-chip" data-quick-refine="把整条脚本压缩成 30 秒极速高密版，保留最强反转钩子">压缩成 30 秒高密版</button>
          <button type="button" class="sample-chip" data-quick-refine="改造成单人手机+百元以内超低成本拍摄方案，进一步减少露脸背稿比例">改成单人手机低成本拍</button>
          <button type="button" class="sample-chip" data-quick-refine="把前 3 秒钩子改得更犀利反常识，强化评论区争议与转发欲">强化前 3 秒冲突钩子</button>
          <button type="button" class="sample-chip" data-rewrite-provider="openai">用 OpenAI (gpt-6.2-sol · High) 重写对比</button>
          <button type="button" class="sample-chip" data-rewrite-provider="google">用 Google (gemini-4-neon · High) 重写对比</button>
          ${optChips}
        </div>

        <div class="refine-form">
          <input id="refine-instruction-input" class="input refine-input" type="text" placeholder="输入自定义导演精修指令，例如：改成黑金暗调桌面微距风格，总时长调整为 60 秒..." />
          <button id="btn-submit-refine" class="btn btn-primary" type="button">执行精修 Agent</button>
        </div>
      </div>
    </article>
  `;
}
