import { reconcileStoryboardTimecodes, calculateSpeechBudget } from './tools.js';

function asString(value, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function asStringArray(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.map((item) => asString(item)).filter(Boolean);
  return cleaned.length ? cleaned : fallback;
}

export function normalizeDurationPlan(raw = {}, fallbackEstimate = {}) {
  const recommendedSeconds = Math.max(
    15,
    Math.min(300, Math.round(Number(raw.recommendedSeconds) || fallbackEstimate.recommendedSeconds || 45))
  );
  const fallbackBudget = calculateSpeechBudget(recommendedSeconds);
  const wb = raw.wordBudget && typeof raw.wordBudget === 'object' ? raw.wordBudget : fallbackBudget;

  return {
    topicCategory: asString(raw.topicCategory, '综合自媒体选题'),
    recommendedSeconds,
    durationLabel: asString(raw.durationLabel, fallbackEstimate.durationLabel || `${recommendedSeconds}秒 · 精选叙事节奏`),
    rationale: asString(
      raw.rationale,
      '根据主题信息密度与平台完播规律映射出的黄金时长，兼顾前 3 秒钩子冲击与实拍可执行性。'
    ),
    recommendedShots: Math.max(
      3,
      Math.min(24, Math.round(Number(raw.recommendedShots) || fallbackEstimate.recommendedShots || 6))
    ),
    wordBudget: {
      seconds: recommendedSeconds,
      charsPerSecond: Number(wb.charsPerSecond) || fallbackBudget.charsPerSecond,
      min: Math.round(Number(wb.min) || fallbackBudget.min),
      ideal: Math.round(Number(wb.ideal) || fallbackBudget.ideal),
      max: Math.round(Number(wb.max) || fallbackBudget.max),
      breathReserveSeconds: Number(wb.breathReserveSeconds) || fallbackBudget.breathReserveSeconds
    },
    pacingCurve:
      Array.isArray(raw.pacingCurve) && raw.pacingCurve.length
        ? raw.pacingCurve.map((seg, i) => ({
            segment: asString(seg.segment, `阶段 ${i + 1}`),
            range: asString(seg.range, ''),
            percent: Math.max(5, Math.min(80, Math.round(Number(seg.percent) || 25))),
            goal: asString(seg.goal, '')
          }))
        : fallbackEstimate.pacingCurve || [],
    alternatives:
      Array.isArray(raw.alternatives) && raw.alternatives.length
        ? raw.alternatives.map((alt) => ({
            seconds: Math.max(15, Math.min(300, Math.round(Number(alt.seconds) || 30))),
            label: asString(alt.label, `${alt.seconds || 30}秒方案`),
            useCase: asString(alt.useCase, '')
          }))
        : fallbackEstimate.alternatives || [],
    platformAdvice: asString(raw.platformAdvice, fallbackEstimate.platformAdvice || '')
  };
}

export function normalizeIdeaBatch(raw = {}, fallbackSeconds = 45, batchOffset = 0) {
  const list = Array.isArray(raw.ideas) ? raw.ideas : Array.isArray(raw) ? raw : [];
  const ideas = list
    .filter((item) => item && typeof item === 'object')
    .map((item, idx) => ({
      id: asString(item.id, `idea_${Date.now().toString(36)}_${batchOffset + idx + 1}`),
      archetype: asString(item.archetype, '差异化切口'),
      title: asString(item.title, `创意方向 #${batchOffset + idx + 1}`),
      hook3s: asString(item.hook3s, ''),
      mappedSeconds: Math.max(
        15,
        Math.min(300, Math.round(Number(item.mappedSeconds) || fallbackSeconds || 45))
      ),
      platformFit: asString(item.platformFit, '抖音 / 小红书 / 视频号'),
      creativeTwist: asString(item.creativeTwist, ''),
      visualMood: asString(item.visualMood, '自然纪实电影感'),
      difficulty: asString(item.difficulty, '轻资产 · 单人/双人可拍'),
      budgetTier: asString(item.budgetTier, '低成本（<100元）'),
      logicHighlight: asString(item.logicHighlight, ''),
      viralPotential: asString(item.viralPotential, '')
    }));

  return {
    creativeDirectionSummary: asString(
      raw.creativeDirectionSummary,
      `已围绕主题发散出 ${ideas.length} 个不同叙事结构与观感风格的创意方向。`
    ),
    ideas
  };
}

export function normalizeShootingScript(raw = {}, fallbackMeta = {}) {
  const targetSeconds = Math.max(
    15,
    Math.min(300, Math.round(Number(raw.targetSeconds) || fallbackMeta.targetSeconds || 45))
  );

  const rawShots = Array.isArray(raw.storyboard) ? raw.storyboard : [];
  const normalizedShots = reconcileStoryboardTimecodes(
    rawShots.map((shot, idx) => ({
      shotNumber: idx + 1,
      phase: asString(shot.phase, `段落 ${idx + 1}`),
      seconds: Math.max(2, Math.round(Number(shot.seconds) || 8)),
      shotSize: asString(shot.shotSize, '中近景'),
      cameraMove: asString(shot.cameraMove, '固定机位'),
      sceneGroup: asString(shot.sceneGroup, idx % 2 === 0 ? 'A组 · 特写/空镜' : 'B组 · 主口播机位'),
      visualAction: asString(shot.visualAction, ''),
      dialogueType: asString(shot.dialogueType, '真人口播'),
      dialogue: asString(shot.dialogue, ''),
      soundDesign: asString(shot.soundDesign, '自然环境原声'),
      postTip: asString(shot.postTip, '极简单行字幕')
    })),
    targetSeconds
  );

  const summary = raw.summary && typeof raw.summary === 'object' ? raw.summary : {};
  const visual = raw.visualAesthetics && typeof raw.visualAesthetics === 'object' ? raw.visualAesthetics : {};
  const prod = raw.productionPlan && typeof raw.productionPlan === 'object' ? raw.productionPlan : {};

  const palette = Array.isArray(visual.colorPalette)
    ? visual.colorPalette
        .map((c) => asString(c))
        .filter((c) => /^#[0-9a-fA-F]{3,8}$/.test(c))
    : [];

  return {
    title: asString(raw.title, fallbackMeta.title || '自媒体实拍脚本'),
    subtitle: asString(raw.subtitle, `${targetSeconds}秒导演级实拍方案`),
    targetSeconds,
    aspectRatio: asString(raw.aspectRatio, '9:16'),
    platformFit: asString(raw.platformFit, fallbackMeta.platformFit || '抖音 / 小红书 / 视频号'),
    summary: {
      coreThesis: asString(summary.coreThesis, ''),
      openingHook: asString(summary.openingHook, ''),
      creativePoints: asStringArray(summary.creativePoints),
      storyLogicChain: asStringArray(summary.storyLogicChain),
      shareTriggers: asStringArray(summary.shareTriggers),
      titleOptions: asStringArray(summary.titleOptions, [asString(raw.title, fallbackMeta.title || '备选标题')]),
      coverConcept: asString(summary.coverConcept, '')
    },
    visualAesthetics: {
      lookAndFeel: asString(visual.lookAndFeel, '自然纪实电影感 · 浅景深'),
      colorPalette: palette.length >= 2 ? palette.slice(0, 5) : ['#1C1A17', '#C2412D', '#D9CBB8', '#F6F2EA'],
      lightingPlan: asString(visual.lightingPlan, ''),
      cameraStyle: asString(visual.cameraStyle, ''),
      soundDesign: asString(visual.soundDesign, ''),
      subtitleAndPackaging: asString(visual.subtitleAndPackaging, '')
    },
    storyboard: normalizedShots,
    productionPlan: {
      estimatedPrepTime: asString(prod.estimatedPrepTime, '30 分钟筹备 · 90 分钟拍摄'),
      estimatedBudget: asString(prod.estimatedBudget, '低成本（<100元）'),
      locationSuggestion: asString(prod.locationSuggestion, ''),
      equipmentAndProps: Array.isArray(prod.equipmentAndProps)
        ? prod.equipmentAndProps
            .filter((x) => x && typeof x === 'object')
            .map((x) => ({
              item: asString(x.item, '基础器材/道具'),
              cost: asString(x.cost, '自有'),
              purpose: asString(x.purpose, '')
            }))
        : [],
      shootingOrder: Array.isArray(prod.shootingOrder)
        ? prod.shootingOrder
            .filter((x) => x && typeof x === 'object')
            .map((x, idx) => ({
              step: Number(x.step) || idx + 1,
              group: asString(x.group, `拍摄组 ${idx + 1}`),
              shotsIncluded: asString(x.shotsIncluded, ''),
              action: asString(x.action, '')
            }))
        : [],
      antiNgTips: asStringArray(prod.antiNgTips),
      postProductionSteps: asStringArray(prod.postProductionSteps)
    }
  };
}

export function normalizeQaAudit(raw = {}, deterministicAudit = {}) {
  const score = Math.max(
    50,
    Math.min(100, Math.round(Number(raw.overallScore) || deterministicAudit.score || 88))
  );
  return {
    overallScore: score,
    verdict: asString(raw.verdict, score >= 88 ? '可直接进场开拍' : '建议按提示微调后开拍'),
    strengths: asStringArray(raw.strengths, ['整体节奏清晰，具备明确可执行镜头设计']),
    risks: asStringArray(raw.risks, deterministicAudit.issues || []),
    optimizationSuggestions: asStringArray(raw.optimizationSuggestions),
    metrics: deterministicAudit.metrics || raw.metrics || {}
  };
}
