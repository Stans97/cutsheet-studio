import { invokeStructuredStage } from '../providers/index.js';
import {
  estimateDurationAndPacing,
  calculateSpeechBudget,
  auditScriptTimingAndWordcount
} from './tools.js';
import {
  normalizeDurationPlan,
  normalizeIdeaBatch,
  normalizeShootingScript,
  normalizeQaAudit
} from './schemas.js';
import {
  buildDurationMapperPrompts,
  buildIdeaGeneratorPrompts,
  buildScriptArchitectPrompts,
  buildQaReviewerPrompts,
  buildScriptRefinerPrompts
} from './prompts.js';

function makeTraceEntry(stage, label, status = 'running') {
  return {
    stage,
    label,
    status,
    startedAt: new Date().toISOString(),
    completedAt: null,
    latencyMs: 0,
    provider: null,
    model: null,
    reasoningLevel: null,
    protocol: null,
    isSandbox: false,
    toolsUsed: [],
    thoughtSummary: '',
    usage: null
  };
}

/**
 * Multi-Stage Agent Pipeline:
 * 1. Topic -> Duration Strategist Agent (with estimate_duration_and_pacing + calculate_speech_budget tools)
 * 2. Multi-Angle Creative Ideation Agent (diverges into 4-8 distinct ideas)
 * 3. Optional auto-expansion of top Idea into complete Shooting Script + Director QA Critic
 */
export async function runDiscoveryPipeline({
  topic,
  platform = 'auto',
  lockedSeconds = null,
  persona = '',
  resources = '',
  ideaCount = 6,
  autoExpandTopIdea = false,
  gateway,
  emit = () => {},
  signal
}) {
  const trace = [];

  // ── Stage 1: Duration Mapping Agent ──────────────────────────
  const t1 = makeTraceEntry('duration_mapper', '01 主题解构与时长映射 Agent');
  trace.push(t1);
  emit('agent_step', { ...t1 });

  const toolEstimate = estimateDurationAndPacing({ topic, platform, lockedSeconds });
  t1.toolsUsed.push({
    name: 'estimate_duration_and_pacing',
    input: { topic, platform, lockedSeconds },
    summary: `测算建议 ${toolEstimate.recommendedSeconds}s · ${toolEstimate.recommendedShots} 镜 · 口播约 ${toolEstimate.wordBudget.ideal} 字`
  });
  emit('agent_tool', {
    stage: 'duration_mapper',
    tool: t1.toolsUsed[0]
  });

  const p1 = buildDurationMapperPrompts({
    topic,
    platform,
    lockedSeconds,
    persona,
    resources,
    toolEstimate
  });

  const res1 = await invokeStructuredStage({
    gateway,
    stage: 'duration_mapper',
    systemPrompt: p1.systemPrompt,
    userPrompt: p1.userPrompt,
    sandboxContext: { topic, platform, targetSeconds: lockedSeconds, toolEstimate },
    signal
  });

  const durationPlan = normalizeDurationPlan(res1.data, toolEstimate);
  Object.assign(t1, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    latencyMs: res1.latencyMs,
    provider: res1.provider,
    model: res1.model,
    reasoningLevel: res1.reasoningLevel,
    protocol: res1.protocol,
    isSandbox: res1.isSandbox,
    thoughtSummary: res1.thoughtSummary,
    usage: res1.usage
  });
  emit('agent_step', { ...t1 });
  emit('duration_plan', { durationPlan, meta: { provider: res1.provider, model: res1.model, reasoningLevel: res1.reasoningLevel, isSandbox: res1.isSandbox } });

  // ── Stage 2: Creative Ideation Agent ─────────────────────────
  const t2 = makeTraceEntry('idea_generator', `02 多维创意发散 Agent（${ideaCount} 个方向）`);
  trace.push(t2);
  emit('agent_step', { ...t2 });

  const p2 = buildIdeaGeneratorPrompts({
    topic,
    platform,
    persona,
    resources,
    durationPlan,
    ideaCount
  });

  const res2 = await invokeStructuredStage({
    gateway,
    stage: 'idea_generator',
    systemPrompt: p2.systemPrompt,
    userPrompt: p2.userPrompt,
    sandboxContext: {
      topic,
      platform,
      targetSeconds: durationPlan.recommendedSeconds,
      durationPlan,
      ideaCount,
      batchIndex: 0
    },
    signal
  });

  const ideaBatch = normalizeIdeaBatch(res2.data, durationPlan.recommendedSeconds, 0);
  Object.assign(t2, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    latencyMs: res2.latencyMs,
    provider: res2.provider,
    model: res2.model,
    reasoningLevel: res2.reasoningLevel,
    protocol: res2.protocol,
    isSandbox: res2.isSandbox,
    thoughtSummary: res2.thoughtSummary,
    usage: res2.usage
  });
  emit('agent_step', { ...t2 });
  emit('ideas_ready', {
    creativeDirectionSummary: ideaBatch.creativeDirectionSummary,
    ideas: ideaBatch.ideas,
    meta: { provider: res2.provider, model: res2.model, reasoningLevel: res2.reasoningLevel, isSandbox: res2.isSandbox }
  });

  let expanded = null;
  if (autoExpandTopIdea && ideaBatch.ideas.length > 0) {
    expanded = await runScriptExpansion({
      topic,
      platform,
      persona,
      resources,
      durationPlan,
      idea: ideaBatch.ideas[0],
      gateway,
      emit,
      signal,
      existingTrace: trace
    });
  }

  return {
    durationPlan,
    creativeDirectionSummary: ideaBatch.creativeDirectionSummary,
    ideas: ideaBatch.ideas,
    expanded,
    trace
  };
}

/**
 * Generate additional distinct ideas for an existing project without repeating existing angles.
 */
export async function runMoreIdeas({
  project,
  count = 4,
  gateway,
  emit = () => {},
  signal
}) {
  const trace = [];
  const t = makeTraceEntry('idea_generator', `追加发散新切口（+${count} 个 Idea）`);
  trace.push(t);
  emit('agent_step', { ...t });

  const excludeTitles = (project.ideas || []).map((i) => i.title);
  const p = buildIdeaGeneratorPrompts({
    topic: project.topic,
    platform: project.platform,
    persona: project.brief?.persona || '',
    resources: project.brief?.resources || '',
    durationPlan: project.durationPlan,
    ideaCount: count,
    excludeTitles
  });

  const res = await invokeStructuredStage({
    gateway,
    stage: 'idea_generator',
    systemPrompt: p.systemPrompt,
    userPrompt: p.userPrompt,
    sandboxContext: {
      topic: project.topic,
      platform: project.platform,
      targetSeconds: project.durationPlan?.recommendedSeconds || project.targetSeconds || 45,
      durationPlan: project.durationPlan,
      ideaCount: count,
      excludeTitles,
      batchIndex: Math.max(1, Math.floor((project.ideas || []).length / 4))
    },
    signal
  });

  const batch = normalizeIdeaBatch(
    res.data,
    project.durationPlan?.recommendedSeconds || 45,
    (project.ideas || []).length
  );

  Object.assign(t, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    latencyMs: res.latencyMs,
    provider: res.provider,
    model: res.model,
    reasoningLevel: res.reasoningLevel,
    protocol: res.protocol,
    isSandbox: res.isSandbox,
    thoughtSummary: res.thoughtSummary,
    usage: res.usage
  });
  emit('agent_step', { ...t });
  emit('ideas_appended', { newIdeas: batch.ideas, creativeDirectionSummary: batch.creativeDirectionSummary });

  return { newIdeas: batch.ideas, trace };
}

/**
 * Stage 3 (Shooting Script Architect) + Stage 4 (Director QA Critic)
 */
export async function runScriptExpansion({
  topic,
  platform = 'auto',
  persona = '',
  resources = '',
  durationPlan = null,
  idea,
  overrideSeconds = null,
  gateway,
  emit = () => {},
  signal,
  existingTrace = null
}) {
  const trace = existingTrace || [];
  const targetSeconds = Number(
    overrideSeconds || idea?.mappedSeconds || durationPlan?.recommendedSeconds || 45
  );

  // ── Stage 3: Shooting Script Architect ───────────────────────
  const t3 = makeTraceEntry('script_architect', '03 逐镜脚本与实拍方案编排 Agent');
  trace.push(t3);
  emit('agent_step', { ...t3 });

  const speechBudget = calculateSpeechBudget(targetSeconds, targetSeconds <= 35 ? 'documentary' : 'balanced');
  t3.toolsUsed.push({
    name: 'calculate_speech_budget',
    input: { seconds: targetSeconds },
    summary: `安全口播区间 ${speechBudget.min}–${speechBudget.max} 字（约 ${speechBudget.charsPerSecond} 字/秒，含 ${speechBudget.breathReserveSeconds}s 留白）`
  });
  emit('agent_tool', { stage: 'script_architect', tool: t3.toolsUsed[0] });

  const effectiveIdea = { ...idea, mappedSeconds: targetSeconds };
  const p3 = buildScriptArchitectPrompts({
    topic,
    platform,
    persona,
    resources,
    durationPlan,
    idea: effectiveIdea,
    speechBudget
  });

  const res3 = await invokeStructuredStage({
    gateway,
    stage: 'script_architect',
    systemPrompt: p3.systemPrompt,
    userPrompt: p3.userPrompt,
    sandboxContext: {
      topic,
      platform,
      durationPlan,
      idea: effectiveIdea,
      overrideSeconds: targetSeconds
    },
    signal
  });

  const script = normalizeShootingScript(res3.data, {
    targetSeconds,
    title: idea?.title || topic,
    platformFit: idea?.platformFit || platform
  });

  Object.assign(t3, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    latencyMs: res3.latencyMs,
    provider: res3.provider,
    model: res3.model,
    reasoningLevel: res3.reasoningLevel,
    protocol: res3.protocol,
    isSandbox: res3.isSandbox,
    thoughtSummary: res3.thoughtSummary,
    usage: res3.usage
  });
  emit('agent_step', { ...t3 });
  emit('script_draft', { script });

  // ── Stage 4: Shootability Critic & Timing Audit ──────────────
  const t4 = makeTraceEntry('shootability_reviewer', '04 导演审片与可拍性质检 Agent');
  trace.push(t4);
  emit('agent_step', { ...t4 });

  const deterministicAudit = auditScriptTimingAndWordcount(script);
  t4.toolsUsed.push({
    name: 'audit_script_timing_and_wordcount',
    input: { shotCount: script.storyboard.length, targetSeconds: script.targetSeconds },
    summary: `实测 ${deterministicAudit.metrics.actualSeconds}s / ${deterministicAudit.metrics.dialogueChars} 字（${deterministicAudit.metrics.charsPerSecond} 字/秒）· 特写空镜占比 ${deterministicAudit.metrics.brollRatio}% · 初评 ${deterministicAudit.score} 分`
  });
  emit('agent_tool', { stage: 'shootability_reviewer', tool: t4.toolsUsed[0] });

  const p4 = buildQaReviewerPrompts({ topic, script, deterministicAudit });
  const res4 = await invokeStructuredStage({
    gateway,
    stage: 'shootability_reviewer',
    systemPrompt: p4.systemPrompt,
    userPrompt: p4.userPrompt,
    sandboxContext: { topic, script },
    signal
  });

  const audit = normalizeQaAudit(res4.data, deterministicAudit);
  Object.assign(t4, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    latencyMs: res4.latencyMs,
    provider: res4.provider,
    model: res4.model,
    reasoningLevel: res4.reasoningLevel,
    protocol: res4.protocol,
    isSandbox: res4.isSandbox,
    thoughtSummary: res4.thoughtSummary,
    usage: res4.usage
  });
  emit('agent_step', { ...t4 });
  emit('audit_ready', { audit });

  return {
    script,
    audit,
    provider: res3.provider,
    model: res3.model,
    reasoningLevel: res3.reasoningLevel,
    isSandbox: res3.isSandbox,
    trace
  };
}

/**
 * Stage 5: Iterative Script Refiner Agent
 */
export async function runScriptRefinement({
  topic,
  platform = 'auto',
  currentScript,
  instruction,
  overrideSeconds = null,
  gateway,
  emit = () => {},
  signal
}) {
  const trace = [];
  const t5 = makeTraceEntry('script_refiner', '05 导演脚本定向精修 Agent');
  trace.push(t5);
  emit('agent_step', { ...t5 });

  const p5 = buildScriptRefinerPrompts({
    topic,
    platform,
    currentScript,
    instruction,
    targetSeconds: overrideSeconds || currentScript.targetSeconds
  });

  const res5 = await invokeStructuredStage({
    gateway,
    stage: 'script_refiner',
    systemPrompt: p5.systemPrompt,
    userPrompt: p5.userPrompt,
    sandboxContext: {
      topic,
      platform,
      script: currentScript,
      instruction
    },
    signal
  });

  const script = normalizeShootingScript(res5.data, {
    targetSeconds: overrideSeconds || res5.data?.targetSeconds || currentScript.targetSeconds,
    title: currentScript.title,
    platformFit: currentScript.platformFit
  });

  const deterministicAudit = auditScriptTimingAndWordcount(script);
  t5.toolsUsed.push({
    name: 'audit_script_timing_and_wordcount',
    input: { shotCount: script.storyboard.length, targetSeconds: script.targetSeconds },
    summary: `精修后核验：${deterministicAudit.metrics.actualSeconds}s · ${deterministicAudit.metrics.dialogueChars} 字（${deterministicAudit.metrics.charsPerSecond} 字/秒）· 质检 ${deterministicAudit.score} 分`
  });

  Object.assign(t5, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    latencyMs: res5.latencyMs,
    provider: res5.provider,
    model: res5.model,
    reasoningLevel: res5.reasoningLevel,
    protocol: res5.protocol,
    isSandbox: res5.isSandbox,
    thoughtSummary: res5.thoughtSummary,
    usage: res5.usage
  });
  emit('agent_step', { ...t5 });

  const audit = normalizeQaAudit(
    {
      overallScore: deterministicAudit.score,
      verdict: deterministicAudit.score >= 88 ? '精修完成，可直接开拍' : '精修完成，建议复查提示项',
      strengths: [
        `已严格落实精修要求：「${instruction}」`,
        `时长对齐 ${deterministicAudit.metrics.actualSeconds}s，语速 ${deterministicAudit.metrics.charsPerSecond} 字/秒`
      ],
      risks: deterministicAudit.issues,
      optimizationSuggestions: ['可继续输入精修指令，或切换 OpenAI / Google 另一模型生成对比版本']
    },
    deterministicAudit
  );
  emit('audit_ready', { audit });

  return {
    script,
    audit,
    provider: res5.provider,
    model: res5.model,
    reasoningLevel: res5.reasoningLevel,
    isSandbox: res5.isSandbox,
    trace
  };
}
