const VALID_DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export function calculateSpeechBudget(seconds, style = 'balanced') {
  const sec = Math.max(10, Number(seconds) || 45);
  // Reserve ~12% for physical sound effects, visual beats, and breathing room
  const effectiveSec = sec * 0.88;
  const rate =
    style === 'documentary' ? 3.5 : style === 'fast' ? 4.2 : 3.8;
  const ideal = Math.round(effectiveSec * rate);
  return {
    seconds: sec,
    charsPerSecond: rate,
    min: Math.round(ideal * 0.8),
    ideal,
    max: Math.round(ideal * 1.18),
    breathReserveSeconds: Number((sec * 0.12).toFixed(1))
  };
}

function buildPacingCurve(seconds) {
  if (seconds <= 20) {
    return [
      { segment: '黄金视觉钩子', range: '0–3s', percent: 20, goal: '制造反差或视觉奇观，阻止划走' },
      { segment: '单点爆破展示', range: `3–${Math.max(8, seconds - 4)}s`, percent: 55, goal: '一刀切入核心爽点/真相' },
      { segment: '金句/反转收尾', range: `${Math.max(8, seconds - 4)}–${seconds}s`, percent: 25, goal: '定格留白或抛出互动提问' }
    ];
  }
  if (seconds <= 35) {
    return [
      { segment: '奇观/痛点钩子', range: '0–6s', percent: 20, goal: '前3秒锁注意力，6秒抛出核心悬念' },
      { segment: '核心拆解与实证', range: '6–22s', percent: 54, goal: '用具体画面/物证推进核心观点' },
      { segment: '判词金句收束', range: `22–${seconds}s`, percent: 26, goal: '截图级收尾，触发点赞与转发' }
    ];
  }
  if (seconds <= 65) {
    const p1 = 5;
    const p2 = Math.round(seconds * 0.32);
    const p3 = Math.round(seconds * 0.78);
    return [
      { segment: '前5秒强钩子', range: `0–${p1}s`, percent: 10, goal: '反常识陈述或强听觉/视觉抓手' },
      { segment: '场景锚定与误区', range: `${p1}–${p2}s`, percent: 22, goal: '建立可信度并点破常见错觉' },
      { segment: '两层递进干货/实证', range: `${p2}–${p3}s`, percent: 46, goal: '从现象深入底层逻辑，穿插特写实证' },
      { segment: '情绪升华与互动落版', range: `${p3}–${seconds}s`, percent: 22, goal: '金句定锚 + 留白/评论区钩子' }
    ];
  }
  const p1 = 6;
  const p2 = Math.round(seconds * 0.25);
  const p3 = Math.round(seconds * 0.65);
  const p4 = Math.round(seconds * 0.86);
  return [
    { segment: '悬念序幕钩子', range: `0–${p1}s`, percent: 8, goal: '结果倒叙或冲突切面瞬间抓人' },
    { segment: '背景铺陈与痛点', range: `${p1}–${p2}s`, percent: 18, goal: '代入真实处境，建立观看预期' },
    { segment: '多维拆解 / 实测过程', range: `${p2}–${p3}s`, percent: 40, goal: '分章节递进，每15秒制造一次小反转或景别切换' },
    { segment: '关键转折与方法沉淀', range: `${p3}–${p4}s`, percent: 20, goal: '给观众可直接抄作业的行动公式' },
    { segment: '余韵总结与互动', range: `${p4}–${seconds}s`, percent: 14, goal: '情感共鸣收束 + 引导收藏/评论' }
  ];
}

function durationTitle(sec) {
  if (sec <= 20) return `${sec}秒 · 极速单点强冲击`;
  if (sec <= 35) return `${sec}秒 · 黄金密度爆款短片`;
  if (sec <= 50) return `${sec}秒 · 观点实证高留存节奏`;
  if (sec <= 70) return `${sec}秒 · 完整起承转合精品短片`;
  if (sec <= 105) return `${sec}秒 · 深度故事/实测拆解`;
  if (sec <= 140) return `${sec}秒 · 两分钟沉浸式专题`;
  return `${sec}秒 · 中视频深度叙事`;
}

/**
 * Deterministic Topic -> Duration Mapping Tool used by Stage 1 Agent.
 */
export function estimateDurationAndPacing({ topic, platform = 'auto', lockedSeconds = null }) {
  const text = String(topic || '').trim();
  const normalizedPlatform = String(platform || 'auto').trim().toLowerCase();

  let score = 45; // baseline 45s
  const signals = [];

  // Depth / structural signals from topic phrasing
  if (/完整|全流程|教程|保姆级|深度|复盘|改造|24小时|一天|30天|测评|评测|对比|故事|经历|Vlog|vlog|专题|盘点/.test(text)) {
    score += 35;
    signals.push('主题包含过程记录/实测/多步骤拆解，需要较充裕的叙事与画面推进空间');
  }
  if (/商业|经济学|逻辑|为什么|真相|尽调|底层|分析|拆解|反思|焦虑|离职|行业/.test(text)) {
    score += 12;
    signals.push('观点洞察类选题需要“反差钩子 + 实证拆解 + 金句收束”完整链路');
  }
  if (/3个|三个|3件|三件|5个|五个|清单|技巧|神器|小物|合集/.test(text)) {
    score += 8;
    signals.push('多要点清单结构适合均匀分配镜头时长（每点 10–15 秒）');
  }
  if (/一句话|瞬间|极简|金句|卡点|变装|30秒|15秒|快闪/.test(text)) {
    score -= 18;
    signals.push('高浓缩视觉/金句切口适合短平快节奏，拉满复播与完播');
  }
  if (text.length >= 45) {
    score += 12;
    signals.push('输入主题信息量丰富，适合展开多层次画面与观点');
  }

  // Platform weighting
  let platformAdvice = '当前为跨平台通用优化（优先兼顾抖音/小红书/视频号黄金完播模型）。';
  if (/抖音|douyin/.test(normalizedPlatform)) {
    score -= 8;
    platformAdvice = '抖音强依赖前 3 秒留存与 30–60 秒高完播，建议压缩铺垫、加快切镜频率。';
  } else if (/小红书|xiaohongshu|xhs/.test(normalizedPlatform)) {
    score += 0;
    platformAdvice = '小红书注重“高颜值首帧 + 可抄作业的实用美学”，45–60 秒最利于收藏转化。';
  } else if (/b站|bilibili|youtube|油管/.test(normalizedPlatform)) {
    score += 45;
    platformAdvice = 'B站 / YouTube 观众偏好深度干货与真实过程记录，90–180 秒更易触发三连与长尾搜索。';
  } else if (/视频号|wechat/.test(normalizedPlatform)) {
    score += 5;
    platformAdvice = '视频号社交推荐权重高，45–60 秒沉稳口播 + 情绪金句最容易驱动熟人转发。';
  }

  let recommendedSeconds;
  if (lockedSeconds && Number(lockedSeconds) >= 15) {
    recommendedSeconds = Math.min(300, Math.max(15, Math.round(Number(lockedSeconds))));
    signals.unshift(`用户已手动锁定目标时长为 ${recommendedSeconds} 秒，已围绕该时长反推最佳镜头密度`);
  } else {
    recommendedSeconds = VALID_DURATIONS.reduce((best, curr) =>
      Math.abs(curr - score) < Math.abs(best - score) ? curr : best
    );
  }

  const wordBudget = calculateSpeechBudget(
    recommendedSeconds,
    recommendedSeconds <= 30 ? 'documentary' : 'balanced'
  );
  const recommendedShots = Math.max(3, Math.min(18, Math.round(recommendedSeconds / 8.5)));

  // Pick 2 distinct alternative durations (handles 15s and 180s boundaries cleanly)
  const altCandidates = VALID_DURATIONS.filter((d) => d !== recommendedSeconds);
  const shorterList = altCandidates.filter((d) => d < recommendedSeconds);
  const longerList = altCandidates.filter((d) => d > recommendedSeconds);
  const altSet = [];
  if (shorterList.length) altSet.push(shorterList[shorterList.length - 1]);
  if (longerList.length) altSet.push(longerList[0]);
  for (const cand of [...longerList.slice(1), ...shorterList.slice(0, -1).reverse()]) {
    if (altSet.length >= 2) break;
    if (!altSet.includes(cand)) altSet.push(cand);
  }

  const alternatives = altSet.map((sec) => ({
    seconds: sec,
    label: durationTitle(sec),
    useCase:
      sec < recommendedSeconds
        ? '极速切片版：适合发抖音/快闪引流，只保留最强 1 个视觉钩子与结论'
        : '深度展开版：适合 B站/小红书深度种草，增加真实细节演示与案例佐证'
  }));

  return {
    recommendedSeconds,
    durationLabel: durationTitle(recommendedSeconds),
    recommendedShots,
    wordBudget,
    pacingCurve: buildPacingCurve(recommendedSeconds),
    alternatives,
    signals,
    platformAdvice
  };
}

export function formatTimecode(startSec, endSec) {
  const fmt = (n) => {
    const safe = Math.max(0, Math.round(n));
    const mm = Math.floor(safe / 60);
    const ss = safe % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };
  return `${fmt(startSec)}–${fmt(endSec)}`;
}

export function reconcileStoryboardTimecodes(storyboard = [], targetSeconds = 45) {
  if (!Array.isArray(storyboard) || !storyboard.length) return [];
  const shots = storyboard.map((s, idx) => ({
    ...s,
    shotNumber: idx + 1,
    seconds: Math.max(2, Math.round(Number(s.seconds) || Math.round(targetSeconds / storyboard.length) || 8))
  }));

  // Gently adjust last shot if total is within +-4s of targetSeconds
  const sum = shots.reduce((acc, s) => acc + s.seconds, 0);
  const delta = targetSeconds - sum;
  if (delta !== 0 && Math.abs(delta) <= 6) {
    const last = shots[shots.length - 1];
    if (last.seconds + delta >= 3) {
      last.seconds += delta;
    }
  }

  let cursor = 0;
  return shots.map((shot) => {
    const start = cursor;
    const end = cursor + shot.seconds;
    cursor = end;
    return {
      ...shot,
      timecode: formatTimecode(start, end)
    };
  });
}

/**
 * Deterministic Shootability & Timing Auditor Tool used by Stage 4 QA Agent.
 */
export function auditScriptTimingAndWordcount(script = {}) {
  const shots = Array.isArray(script.storyboard) ? script.storyboard : [];
  const targetSeconds = Number(script.targetSeconds) || 45;
  const actualSeconds = shots.reduce((acc, s) => acc + (Number(s.seconds) || 0), 0);
  const durationDelta = actualSeconds - targetSeconds;

  const dialogueChars = shots.reduce((acc, s) => {
    const clean = String(s.dialogue || '')
      .replace(/[\s，。！？、；：“”‘’（）()【】\[\]—\-,.!?;:'"]/g, '');
    return acc + clean.length;
  }, 0);

  const charsPerSecond = actualSeconds > 0 ? Number((dialogueChars / actualSeconds).toFixed(2)) : 0;

  const onCameraShots = shots.filter((s) => /真人|出镜|口播/.test(String(s.dialogueType || '')) && !/画外音|VO/i.test(String(s.dialogueType || ''))).length;
  const brollRatio = shots.length > 0 ? Math.round(((shots.length - onCameraShots) / shots.length) * 100) : 0;

  const issues = [];
  let score = 96;

  if (!shots.length) {
    issues.push('分镜列表为空，无法执行实拍');
    score -= 40;
  }
  if (Math.abs(durationDelta) > 5) {
    issues.push(`分镜累计时长（${actualSeconds}s）与目标时长（${targetSeconds}s）偏差 ${durationDelta > 0 ? '+' : ''}${durationDelta} 秒，建议微调镜头时长`);
    score -= 8;
  }
  if (charsPerSecond > 4.6) {
    issues.push(`口播语速偏快（${charsPerSecond} 字/秒，总计 ${dialogueChars} 字），实拍易显得赶词，建议精简 15% 台词或拉长片长`);
    score -= 9;
  } else if (dialogueChars > 0 && charsPerSecond < 1.6) {
    issues.push(`口播信息密度偏稀疏（${charsPerSecond} 字/秒），若非纯氛围大片建议增强关键信息点`);
    score -= 4;
  }
  if (shots[0] && Number(shots[0].seconds) > 10) {
    issues.push(`第 1 镜长达 ${shots[0].seconds} 秒，前 3–5 秒钩子节奏可能偏慢，建议在第 4–6 秒内切景`);
    score -= 5;
  }
  if (shots.length >= 4 && brollRatio < 25) {
    issues.push(`非露脸特写/空镜占比仅 ${brollRatio}%，全程盯镜头口播容易造成博主背稿 NG 且画面单调`);
    score -= 5;
  }
  if (!script.productionPlan?.shootingOrder?.length) {
    issues.push('缺少按机位合并的现场顺场拍摄步骤，现场拆灯效率可能偏低');
    score -= 5;
  }

  return {
    score: Math.max(55, Math.min(99, score)),
    passed: score >= 80,
    metrics: {
      targetSeconds,
      actualSeconds,
      durationDelta,
      shotCount: shots.length,
      dialogueChars,
      charsPerSecond,
      brollRatio
    },
    issues
  };
}

export function exportScriptToMarkdown({ project, scriptRecord }) {
  const s = scriptRecord?.script || {};
  const audit = scriptRecord?.audit || {};
  const lines = [];

  lines.push(`# ${s.title || project?.topic || '自媒体拍摄脚本'}`);
  lines.push('');
  if (s.subtitle) lines.push(`> ${s.subtitle}`);
  lines.push('');
  lines.push(`- **原始主题**：${project?.topic || '-'}`);
  lines.push(`- **成片规格**：${s.aspectRatio || '9:16'} · ${s.targetSeconds || 45} 秒 · 适配平台：${s.platformFit || '多平台'}`);
  lines.push(`- **生成引擎**：${scriptRecord?.provider || 'sandbox'} / ${scriptRecord?.model || '-'}（思考强度：${scriptRecord?.reasoningLevel || 'high'}）`);
  lines.push('');

  lines.push('## 一、创意点与叙事逻辑');
  lines.push('');
  if (s.summary?.coreThesis) lines.push(`- **核心命题**：${s.summary.coreThesis}`);
  if (s.summary?.openingHook) lines.push(`- **前 3 秒黄金钩子**：${s.summary.openingHook}`);
  if (Array.isArray(s.summary?.creativePoints) && s.summary.creativePoints.length) {
    lines.push('- **核心创意点**：');
    for (const p of s.summary.creativePoints) lines.push(`  - ${p}`);
  }
  if (Array.isArray(s.summary?.storyLogicChain) && s.summary.storyLogicChain.length) {
    lines.push('- **叙事逻辑链**：');
    for (const step of s.summary.storyLogicChain) lines.push(`  - ${step}`);
  }
  if (Array.isArray(s.summary?.titleOptions) && s.summary.titleOptions.length) {
    lines.push('- **备选爆款标题**：');
    for (const t of s.summary.titleOptions) lines.push(`  - ${t}`);
  }
  if (s.summary?.coverConcept) lines.push(`- **封面视觉方案**：${s.summary.coverConcept}`);
  lines.push('');

  lines.push('## 二、视觉观感与声景设定');
  lines.push('');
  const v = s.visualAesthetics || {};
  if (v.lookAndFeel) lines.push(`- **整体影调与观感**：${v.lookAndFeel}`);
  if (Array.isArray(v.colorPalette) && v.colorPalette.length) {
    lines.push(`- **建议色卡**：${v.colorPalette.join(' · ')}`);
  }
  if (v.lightingPlan) lines.push(`- **布光方案**：${v.lightingPlan}`);
  if (v.cameraStyle) lines.push(`- **景别与运镜风格**：${v.cameraStyle}`);
  if (v.soundDesign) lines.push(`- **收音与音效设计**：${v.soundDesign}`);
  if (v.subtitleAndPackaging) lines.push(`- **字幕与极简包装**：${v.subtitleAndPackaging}`);
  lines.push('');

  lines.push('## 三、逐镜分镜脚本表');
  lines.push('');
  lines.push('| 镜号 | 时间轴 | 景别与运镜 | 画面与动作调度 | 台词（口播 / VO） | 同期声与音效 | 后期包装 |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
  for (const shot of s.storyboard || []) {
    const clean = (val) => String(val || '-').replace(/\|/g, '｜').replace(/\r?\n/g, '<br>');
    lines.push(
      `| #${shot.shotNumber}<br>${clean(shot.phase)} | ${clean(shot.timecode)}<br>(${shot.seconds}s) | ${clean(shot.shotSize)}<br>${clean(shot.cameraMove)} | ${clean(shot.visualAction)} | **[${clean(shot.dialogueType)}]** ${clean(shot.dialogue)} | ${clean(shot.soundDesign)} | ${clean(shot.postTip)} |`
    );
  }
  lines.push('');

  lines.push('## 四、拍摄步骤与现场执行方案');
  lines.push('');
  const p = s.productionPlan || {};
  if (p.estimatedPrepTime) lines.push(`- **周期估算**：${p.estimatedPrepTime}`);
  if (p.estimatedBudget) lines.push(`- **预算分级**：${p.estimatedBudget}`);
  if (p.locationSuggestion) lines.push(`- **场地建议**：${p.locationSuggestion}`);
  lines.push('');

  if (Array.isArray(p.equipmentAndProps) && p.equipmentAndProps.length) {
    lines.push('### 器材与道具清单');
    for (const eq of p.equipmentAndProps) {
      lines.push(`- **${eq.item}**（${eq.cost || '已有'}）：${eq.purpose || ''}`);
    }
    lines.push('');
  }

  if (Array.isArray(p.shootingOrder) && p.shootingOrder.length) {
    lines.push('### 现场顺场实拍步骤（按机位合并，避免反复拆灯）');
    for (const step of p.shootingOrder) {
      lines.push(`${step.step}. **${step.group}**（包含：${step.shotsIncluded || '-'}）：${step.action}`);
    }
    lines.push('');
  }

  if (Array.isArray(p.antiNgTips) && p.antiNgTips.length) {
    lines.push('### 现场提词与降 NG 提示');
    for (const tip of p.antiNgTips) lines.push(`- ${tip}`);
    lines.push('');
  }

  if (Array.isArray(p.postProductionSteps) && p.postProductionSteps.length) {
    lines.push('### 后期剪辑流程');
    for (const step of p.postProductionSteps) lines.push(`- ${step}`);
    lines.push('');
  }

  if (audit?.overallScore) {
    lines.push('## 五、导演审片质检');
    lines.push('');
    lines.push(`- **综合可拍性评分**：${audit.overallScore} / 100（${audit.verdict || ''}）`);
    if (audit.metrics) {
      lines.push(`- **数据核验**：共 ${audit.metrics.shotCount} 镜 · 总计 ${audit.metrics.actualSeconds}s · 口播 ${audit.metrics.dialogueChars} 字（${audit.metrics.charsPerSecond} 字/秒）· 特写/空镜占比 ${audit.metrics.brollRatio}%`);
    }
    if (Array.isArray(audit.risks) && audit.risks.length) {
      lines.push('- **注意事项**：');
      for (const r of audit.risks) lines.push(`  - ${r}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
