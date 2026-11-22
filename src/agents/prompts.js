import { calculateSpeechBudget } from './tools.js';

export function buildDurationMapperPrompts({
  topic,
  platform,
  lockedSeconds,
  persona,
  resources,
  toolEstimate
}) {
  const systemPrompt = `你是自媒体监制 Agent，只做一件事：把主题映射为最合适的片长与节奏。
规则：
1. 只输出单一合法简体中文 JSON，严禁多余文字。
2. 表达极度精炼、直给结论，禁止空话套话：rationale ≤ 45字，platformAdvice ≤ 30字，每段 goal ≤ 18字。
3. 口播按 3.5–4.0 字/秒估算并留同期声呼吸空间。

JSON 结构：
{
  "topicCategory": "赛道名（≤8字）",
  "recommendedSeconds": 45,
  "durationLabel": "45秒 · 观点实证",
  "rationale": "一句大白话说清为何选此时长（≤45字）",
  "recommendedShots": 6,
  "wordBudget": { "charsPerSecond": 3.8, "min": 120, "ideal": 150, "max": 175, "breathReserveSeconds": 5.4 },
  "pacingCurve": [
    { "segment": "钩子", "range": "0-5s", "percent": 12, "goal": "≤18字目标" }
  ],
  "alternatives": [
    { "seconds": 30, "label": "30秒 · 极速切片", "useCase": "≤20字说明" },
    { "seconds": 90, "label": "90秒 · 深度展开", "useCase": "≤20字说明" }
  ],
  "platformAdvice": "一句话平台建议（≤30字）"
}`;

  const userPrompt = `主题：${topic}
平台：${platform || 'auto'}
锁定片长：${lockedSeconds ? `${lockedSeconds}秒` : '智能映射'}
人设：${persona || '克制有审美'}
条件：${resources || '单人/双人轻资产'}
测算基线：${JSON.stringify(toolEstimate)}`;

  return { systemPrompt, userPrompt };
}

export function buildIdeaGeneratorPrompts({
  topic,
  platform,
  persona,
  resources,
  durationPlan,
  ideaCount = 6,
  excludeTitles = []
}) {
  const systemPrompt = `你是自媒体总策划 Agent，围绕同一主题一次性输出 ${ideaCount} 个完全不同角度的拍摄 Idea。
规则：
1. 只输出单一合法简体中文 JSON。
2. 严禁啰嗦：每条字段必须短促有力、一眼扫完。
   - title ≤ 22字
   - hook3s ≤ 28字（可直接念出口的开场句）
   - creativeTwist ≤ 32字（直说差异化切口）
   - visualMood ≤ 20字（画面观感/光线/构图关键词）
   - logicHighlight ≤ 26字（用 → 连接）
   - difficulty ≤ 12字，budgetTier ≤ 10字
3. ${ideaCount} 个方向必须叙事结构互斥（反常识揭秘 / 器物微距 / 第一视角实测 / 对照反转 / 故事冲突 / 极速清单等）。

JSON 结构：
{
  "creativeDirectionSummary": "一句话概括本次发散（≤30字）",
  "ideas": [
    {
      "id": "idea_1",
      "archetype": "4-6字标签",
      "title": "标题（≤22字）",
      "hook3s": "前3秒开场句（≤28字）",
      "mappedSeconds": 45,
      "platformFit": "抖音 / 小红书",
      "creativeTwist": "差异化创意点（≤32字）",
      "visualMood": "画面影调与观感（≤20字）",
      "difficulty": "单人可拍",
      "budgetTier": "<50元",
      "logicHighlight": "钩子 → 反转 → 实证 → 金句",
      "viralPotential": "一句话传播点（≤20字）"
    }
  ]
}`;

  const excludeNote = excludeTitles.length ? `\n避重标题：${excludeTitles.join('；')}` : '';
  const userPrompt = `主题：${topic}
推荐时长参考：${durationPlan?.recommendedSeconds || 45}秒
平台：${platform || 'auto'} | 人设：${persona || '默认'} | 条件：${resources || '轻资产'}${excludeNote}`;

  return { systemPrompt, userPrompt };
}

export function buildScriptArchitectPrompts({
  topic,
  platform,
  persona,
  resources,
  durationPlan,
  idea,
  speechBudget
}) {
  const targetSeconds = idea?.mappedSeconds || durationPlan?.recommendedSeconds || 45;
  const systemPrompt = `你是实战派短视频导演 Agent，把选定 Idea 写成“拿着手机就能直接开拍”的精简实拍通告单。
硬性规则：
1. 只输出单一合法简体中文 JSON。
2. **极度简洁、拒绝废话**：
   - coreThesis ≤ 35字；creativePoints 限 3 条、每条 ≤ 28字；storyLogicChain 限 4 步、每步 ≤ 18字；shareTriggers 限 2 条、每条 ≤ 18字；titleOptions 限 3 个；coverConcept ≤ 35字。
   - visualAesthetics 每项（lookAndFeel / lightingPlan / cameraStyle / soundDesign / subtitleAndPackaging）各 ≤ 35字，直给参数和做法。
   - storyboard 每镜：visualAction ≤ 45字（写清光线/动作/道具），soundDesign ≤ 22字，postTip ≤ 18字。
   - productionPlan：equipmentAndProps 限 3–4 项；shootingOrder 必须**按机位合并顺场拍法**（3 步，每步 action ≤ 40字）；antiNgTips 限 2–3 条（≤28字）；postProductionSteps 限 3–4 步（≤28字）。
3. 所有分镜 seconds 之和必须精准等于 ${targetSeconds} 秒；全片口播总字数控制在 ${speechBudget.min}–${speechBudget.max} 字，40%–60% 用特写/空镜 VO 降低背稿压力。
4. colorPalette 给 4 个协调 Hex 色值。

JSON 结构：
{
  "title": "标题",
  "subtitle": "一句话规格（≤22字）",
  "targetSeconds": ${targetSeconds},
  "aspectRatio": "9:16",
  "platformFit": "抖音 / 小红书",
  "summary": {
    "coreThesis": "核心命题（≤35字）",
    "openingHook": "前3秒开场句",
    "creativePoints": ["创意点1", "创意点2", "创意点3"],
    "storyLogicChain": ["01 钩子", "02 误区", "03 实证", "04 金句"],
    "shareTriggers": ["收藏点", "评论点"],
    "titleOptions": ["标题1", "标题2", "标题3"],
    "coverConcept": "封面画面与大字建议（≤35字）"
  },
  "visualAesthetics": {
    "lookAndFeel": "整体观感（≤30字）",
    "colorPalette": ["#1C1A17", "#C2412D", "#D9CBB8", "#F6F2EA"],
    "lightingPlan": "布光做法（≤35字）",
    "cameraStyle": "焦段运镜（≤35字）",
    "soundDesign": "收音与同期声（≤35字）",
    "subtitleAndPackaging": "字幕包装（≤30字）"
  },
  "storyboard": [
    {
      "shotNumber": 1,
      "phase": "钩子",
      "seconds": 6,
      "shotSize": "俯拍特写",
      "cameraMove": "固定机位",
      "sceneGroup": "A组·特写",
      "visualAction": "具体画面动作（≤45字）",
      "dialogueType": "VO 画外音",
      "dialogue": "自然口语台词",
      "soundDesign": "物理音效（≤22字）",
      "postTip": "字幕/标签（≤18字）"
    }
  ],
  "productionPlan": {
    "estimatedPrepTime": "筹备20分 · 拍摄60分 · 剪辑30分",
    "estimatedBudget": "<100元",
    "locationSuggestion": "场地建议（≤25字）",
    "equipmentAndProps": [{ "item": "物品", "cost": "成本", "purpose": "用途（≤18字）" }],
    "shootingOrder": [{ "step": 1, "group": "A组·特写", "shotsIncluded": "镜#1、#3", "action": "顺场操作（≤40字）" }],
    "antiNgTips": ["降NG技巧（≤28字）"],
    "postProductionSteps": ["1. 粗剪...", "2. 叠B-Roll...", "3. 音效调色..."]
  }
}`;

  const userPrompt = `主题：${topic}
选定创意：${JSON.stringify(idea)}
目标时长：${targetSeconds}秒（口播预算 ${speechBudget.min}–${speechBudget.max} 字）
平台：${platform || idea?.platformFit || 'auto'} | 人设：${persona || '默认'} | 条件：${resources || '轻资产'}`;

  return { systemPrompt, userPrompt };
}

export function buildQaReviewerPrompts({ topic, script, deterministicAudit }) {
  const systemPrompt = `你是审片导演 Agent，用最精炼的短句给出实拍质检结论。
规则：只输出合法简体中文 JSON；strengths / risks / optimizationSuggestions 各限 2 条，每条 ≤ 26字，直指问题不废话。

JSON 结构：
{
  "overallScore": 90,
  "verdict": "可直接开拍 或 建议微调",
  "strengths": ["优点1", "优点2"],
  "risks": ["风险1", "风险2"],
  "optimizationSuggestions": ["优化指令1", "优化指令2"]
}`;

  const userPrompt = `主题：${topic}
量化指标：${JSON.stringify(deterministicAudit)}
脚本：${JSON.stringify(script)}`;

  return { systemPrompt, userPrompt };
}

export function buildScriptRefinerPrompts({ topic, platform, currentScript, instruction, targetSeconds }) {
  const speechBudget = calculateSpeechBudget(targetSeconds || currentScript.targetSeconds || 45);
  const systemPrompt = `你是脚本精修 Agent。严格落实用户修改指令，输出结构相同、更精炼可拍的完整 JSON 脚本（拒绝啰嗦）。
分镜 seconds 之和精准等于目标时长，口播总字数控制在 ${speechBudget.min}–${speechBudget.max} 字。只输出合法 JSON。`;

  const userPrompt = `主题：${topic} | 平台：${platform || currentScript.platformFit || 'auto'}
精修指令：${instruction}
参考时长：${targetSeconds || currentScript.targetSeconds || 45}秒
当前脚本：${JSON.stringify(currentScript)}`;

  return { systemPrompt, userPrompt };
}
