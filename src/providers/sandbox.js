import { estimateDurationAndPacing, auditScriptTimingAndWordcount } from '../agents/tools.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectDomain(topic) {
  const text = String(topic || '');
  if (/商业|店|品牌|流量|定价|消费|经济|赚钱|咖啡|奶茶|安福路|商场|网红|生意|尽调|溢价/.test(text)) {
    return {
      key: 'business',
      label: '商业观察',
      lookStyle: '35mm 城市胶片 · 午后侧逆暖光 + 浅景深',
      palette: ['#1E1C1A', '#C89B54', '#E8DFCF', '#8C3B2B'],
      aspectRatio: '9:16',
      soundStrategy: '保留脚步/咖啡冰块等物理原声，弱化配乐，人声低沉贴耳',
      props: [
        { item: '35mm 定焦（或手机 2x 人像）', cost: '自有', purpose: '虚化杂乱路人' },
        { item: '无线领夹麦 + 防风毛套', cost: '自有', purpose: '户外人声干净' },
        { item: '冰美式 / 账单实物道具', cost: '30元', purpose: '手部动作支点' }
      ]
    };
  }
  if (/租房|家居|改造|房间|桌面|收纳|卧室|客厅|装修|软装|极简/.test(text)) {
    return {
      key: 'home',
      label: '空间改造',
      lookStyle: '自然日光杂志风 · Before冷灰 → After暖白',
      palette: ['#F4EFE6', '#C9A87C', '#4A554C', '#2B2824'],
      aspectRatio: '9:16',
      soundStrategy: '放大开箱/贴膜/开关灯咔哒声，转场后渐入轻吉他',
      props: [
        { item: '三脚架固定机位', cost: '自有', purpose: '锁死同机位拍前后对比' },
        { item: '2700K 暖光灯带/台灯', cost: '49元', purpose: '关顶灯拉出明暗层次' },
        { item: '核心软装小物 2–3 件', cost: '<100元', purpose: '制造低成本落地爽点' }
      ]
    };
  }
  if (/AI|科技|数码|效率|工具|手机|电脑|软件|代码|相机|评测|测评/.test(text)) {
    return {
      key: 'tech',
      label: '硬核实测',
      lookStyle: '黑灰桌面微距 · 单灯硬光勾边 + 屏幕特写',
      palette: ['#141619', '#2E3440', '#D08770', '#ECEFF4'],
      aspectRatio: '16:9',
      soundStrategy: '保留键盘/点击脆响，转折处配轻微节奏提示音',
      props: [
        { item: '哑光深色桌垫 + 俯拍架', cost: '60元', purpose: '桌面干净不反光' },
        { item: '60W 常亮灯 + 格栅柔光箱', cost: '自有', purpose: '45° 侧顶打亮桌面' },
        { item: '局部放大录屏', cost: '0元', purpose: '实测演示替代口头吹捧' }
      ]
    };
  }
  if (/职场|离职|面试|副业|焦虑|沟通|成长|思维|习惯|自律|读书/.test(text)) {
    return {
      key: 'career',
      label: '观点叙事',
      lookStyle: '窗边半侧逆光 · 低饱和暗调中近景',
      palette: ['#1B1F23', '#3D4852', '#D4A373', '#F5F1EB'],
      aspectRatio: '9:16',
      soundStrategy: '近场人声 + 极轻氛围底噪（-28dB），金句前停顿 0.6s',
      props: [
        { item: '笔记本 / 咖啡杯特写', cost: '0元', purpose: '穿插手部空镜降背稿压力' },
        { item: '靠窗自然光 / 单盏落地灯', cost: '0元', purpose: '低成本出深度访谈感' },
        { item: '手机提词器（距镜头 1.2m）', cost: '0元', purpose: '眼神不飘移少 NG' }
      ]
    };
  }
  if (/美食|做饭|探店|餐厅|甜品|咖啡|早餐|减脂|菜谱/.test(text)) {
    return {
      key: 'food',
      label: '美食烟火',
      lookStyle: '暖调微距 · 背光打亮蒸汽与油润高光',
      palette: ['#231915', '#B8522A', '#E6B86A', '#FAF3E7'],
      aspectRatio: '9:16',
      soundStrategy: '贴近收录热油/切菜/倒水原声，口播克制不抢戏',
      props: [
        { item: '斜后方逆光补光灯', cost: '80元', purpose: '拍出食材油润与热气' },
        { item: '哑光深色盘 + 木砧板', cost: '45元', purpose: '衬托色泽防过曝' },
        { item: '2x 微距 + 俯拍架', cost: '自有', purpose: '拍切开/淋汁高潮帧' }
      ]
    };
  }
  return {
    key: 'editorial',
    label: '观点纪实',
    lookStyle: '低饱和胶片感 · 自然侧光 + 浅景深',
    palette: ['#1C1A17', '#C2412D', '#D9CBB8', '#F6F2EA'],
    aspectRatio: '9:16',
    soundStrategy: '优先保留现场物理原声，轻点节奏音效，不铺土味配乐',
    props: [
      { item: '手机 2x 焦段 / 35mm 微单', cost: '自有', purpose: '人像不畸变、背景柔化' },
      { item: '无线领夹麦', cost: '自有', purpose: '人声干净决定高级感' },
      { item: '1 件主题核心实物道具', cost: '<50元', purpose: '前 3 秒视觉抓手' }
    ]
  };
}

function shortTopic(topic) {
  const clean = String(topic || '').trim().replace(/[？?！!。]+$/, '');
  return clean.length > 18 ? `${clean.slice(0, 18)}…` : clean;
}

function buildIdeaTemplates(topic, domain, baseSeconds, platform, batchIndex = 0) {
  const t = shortTopic(topic);
  const sShort = Math.max(15, Math.min(30, Math.round((baseSeconds * 0.65) / 15) * 15 || 30));
  const sMain = baseSeconds;
  const sLong = Math.min(180, Math.max(60, Math.round((baseSeconds * 1.5) / 15) * 15 || 90));

  const poolA = [
    {
      id: `idea_${batchIndex}_1`,
      archetype: '反常识揭秘',
      title: `拆穿「${t}」背后的真实账本`,
      hook3s: `“都在追「${t}」，换个角度算笔账，90% 的人都看反了。”`,
      mappedSeconds: sMain,
      platformFit: platform === 'auto' ? '抖音 / 视频号' : platform,
      creativeTwist: '跳过泛科普，用 1 个具体细节拆穿隐性成本与底层逻辑。',
      visualMood: domain.lookStyle,
      difficulty: '单/双人易拍',
      budgetTier: '<100元',
      logicHighlight: '奇观开场 → 拆误区 → 亮底牌 → 金句收尾',
      viralPotential: '认知反差直接触发评论争论'
    },
    {
      id: `idea_${batchIndex}_2`,
      archetype: '器物微距',
      title: `3 个微距细节，看懂「${t}」的高级密码`,
      hook3s: `“别听大道理，盯紧眼前这 3 个细节，30 秒看透「${t}」。”`,
      mappedSeconds: sShort,
      platformFit: platform === 'auto' ? '小红书 / 抖音' : platform,
      creativeTwist: '60% 画面拍 90° 俯拍手部与物证，零背稿压力且观感极干净。',
      visualMood: '黑石桌面微距 · 单顶光 + 极细标注线',
      difficulty: '单人桌面拍',
      budgetTier: '<50元',
      logicHighlight: '物证落桌 → 三步指认 → 一句判词',
      viralPotential: '首帧干净抓眼，极适合批量周更'
    },
    {
      id: `idea_${batchIndex}_3`,
      archetype: '第一视角实测',
      title: `亲测「${t}」一整天：不加滤镜的真实记录`,
      hook3s: `“全网都在夸「${t}」，今天不讲废话，带镜头从第一分钟实测。”`,
      mappedSeconds: sLong,
      platformFit: platform === 'auto' ? 'B站 / 小红书' : platform,
      creativeTwist: '时间轴倒计时 + POV 第一视角，保留 1 个真实踩坑插曲拉满信任。',
      visualMood: '自然光手持跟拍 · 同期现场声',
      difficulty: '需外出跟拍',
      budgetTier: '按场景实付',
      logicHighlight: '立挑战 → 实测节点 → 意外转折 → 避坑结论',
      viralPotential: '强悬念拉满完播与收藏'
    },
    {
      id: `idea_${batchIndex}_4`,
      archetype: '对照组反转',
      title: `同样「${t}」，为什么有人廉价有人像大片？`,
      hook3s: `“左边 99% 新手都会踩坑，只改一个动作，右边质感翻倍。”`,
      mappedSeconds: sMain,
      platformFit: platform === 'auto' ? '抖音 / 小红书' : platform,
      creativeTwist: '同机位 Before/After 强对比，每步改动都有肉眼可见的视觉落差。',
      visualMood: '冷灰平光 → 打响指转场 → 暖金浅景深',
      difficulty: '单人固定机位',
      budgetTier: '<80元',
      logicHighlight: '错误示范 → 3 处低成本改动 → 成品定格',
      viralPotential: '抄作业收藏率最高'
    },
    {
      id: `idea_${batchIndex}_5`,
      archetype: '故事冲突',
      title: `差点放弃「${t}」那天，一个瞬间改变了我`,
      hook3s: `“上周要是没把「${t}」按暂停键，我现在还在原地打转。”`,
      mappedSeconds: sMain,
      platformFit: platform === 'auto' ? '视频号 / 抖音' : platform,
      creativeTwist: '用真实窘境切入包裹干货观点，先共情“人”，再认同观点。',
      visualMood: '黄昏窗边逆光 · 慢推电影感',
      difficulty: '单人室内外',
      budgetTier: '0元',
      logicHighlight: '危机切面 → 核心卡点 → 顿悟动作 → 温柔判词',
      viralPotential: '高共鸣驱动私信转发'
    },
    {
      id: `idea_${batchIndex}_6`,
      archetype: '极速三连',
      title: `关于「${t}」的 3 条潜规则，第 3 条少有人明说`,
      hook3s: `“关于「${t}」，早知道这 3 条潜规则能少走半年弯路。”`,
      mappedSeconds: sShort,
      platformFit: platform === 'auto' ? '抖音 / 视频号' : platform,
      creativeTwist: '10 秒一条密集递进（技巧 → 心法 → 真相），三场景动作无缝跳剪。',
      visualMood: '明快高对比 · 走动/坐姿/特写跳剪',
      difficulty: '手机 1h 连拍',
      budgetTier: '0元',
      logicHighlight: '抛承诺 → 3 点快切 → 评论对号入座',
      viralPotential: '最稳的起号高频基本盘'
    }
  ];

  const poolB = [
    {
      id: `idea_${batchIndex}_7`,
      archetype: '街头验证',
      title: `拿「${t}」去问路人，结果比想象更扎心`,
      hook3s: `“网上对「${t}」吵翻了，直接搬到街头听普通人第一反应。”`,
      mappedSeconds: sLong,
      platformFit: platform === 'auto' ? '抖音 / B站' : platform,
      creativeTwist: '用 3 组真实反差回答替代自说自话，最后 10 秒犀利收束。',
      visualMood: '35mm 纪实街拍 · 现场同期人声',
      difficulty: '需外出采访',
      budgetTier: '低成本',
      logicHighlight: '抛争议 → 3 组反差快剪 → 博主定调',
      viralPotential: '天然社会议题高评论率'
    },
    {
      id: `idea_${batchIndex}_8`,
      archetype: '时间压缩',
      title: `把「${t}」30 天变化压进 30 秒，第 18 秒质变`,
      hook3s: `“围绕「${t}」只改一个小动作，第 1 天像笑话，第 18 天变了。”`,
      mappedSeconds: sShort,
      platformFit: platform === 'auto' ? '小红书 / 抖音' : platform,
      creativeTwist: '同机位多日匹配剪辑，让时间本身当叙事，几乎不用长口播。',
      visualMood: '同构图卡点匹配 · 暖调胶片颗粒',
      difficulty: '需跨日留素材',
      budgetTier: '0元',
      logicHighlight: '结果预告 → 快速推进 → 质变定格',
      viralPotential: '极强视觉爽感高复播'
    },
    {
      id: `idea_${batchIndex}_9`,
      archetype: '爆款拉片',
      title: `同样讲「${t}」，为什么别人破百万我们没流量？`,
      hook3s: `“同样拍「${t}」，那条百万赞视频藏着 2 条没人注意的暗线。”`,
      mappedSeconds: sMain,
      platformFit: platform === 'auto' ? 'B站 / 小红书' : platform,
      creativeTwist: '同行拉片视角 + 桌面手绘圈注，把隐形结构剥成 1 个复用公式。',
      visualMood: '桌面俯拍 + 屏幕局部特写 + 极细框线',
      difficulty: '单人桌面半小时',
      budgetTier: '0元',
      logicHighlight: '高对比悬念 → 拆前3秒与中段 → 给复用公式',
      viralPotential: '精准吸引高价值垂直粉丝'
    },
    {
      id: `idea_${batchIndex}_10`,
      archetype: '暗场独白',
      title: `关于「${t}」，说句不讨喜但很值钱的实话`,
      hook3s: `“这话可能得罪人，但关于「${t}」，你迟早要面对这个现实。”`,
      mappedSeconds: sMain,
      platformFit: platform === 'auto' ? '视频号 / 抖音' : platform,
      creativeTwist: '去花哨转场，用单灯明暗对比与精准短句立高辨识度主理人 IP。',
      visualMood: '低饱和黑金暗调 · 单侧轮廓光',
      difficulty: '关顶灯+1盏灯',
      budgetTier: '<60元',
      logicHighlight: '反共识声明 → 生活切面 → 戳破悖论 → 留白',
      viralPotential: '极强高净值粉丝粘性'
    }
  ];

  return batchIndex % 2 === 0 ? poolA : poolB;
}

function buildStoryboardShots(topic, idea, totalSeconds) {
  const t = shortTopic(topic);
  const archetype = idea?.archetype || '反常识揭秘';

  let segments;
  if (totalSeconds <= 20) {
    const s1 = Math.max(3, Math.round(totalSeconds * 0.25));
    const s2 = Math.max(5, Math.round(totalSeconds * 0.45));
    segments = [
      { role: '钩子', sec: s1 },
      { role: '核心反转', sec: s2 },
      { role: '金句定格', sec: totalSeconds - s1 - s2 }
    ];
  } else if (totalSeconds <= 35) {
    segments = [
      { role: '视觉钩子', sec: 6 },
      { role: '拆穿误区', sec: 8 },
      { role: '核心实证', sec: 9 },
      { role: '金句收尾', sec: totalSeconds - 23 }
    ];
  } else if (totalSeconds <= 55) {
    segments = [
      { role: '前5秒钩子', sec: 5 },
      { role: '现场定锚', sec: 10 },
      { role: '底层拆解', sec: 12 },
      { role: '细节实证', sec: 10 },
      { role: '金句落版', sec: totalSeconds - 37 }
    ];
  } else if (totalSeconds <= 75) {
    segments = [
      { role: '视觉钩子', sec: 5 },
      { role: '人设出场', sec: 10 },
      { role: '表象拆穿', sec: 13 },
      { role: '微距物证', sec: 12 },
      { role: '对比落地', sec: 11 },
      { role: '金句互动', sec: totalSeconds - 51 }
    ];
  } else {
    const count = totalSeconds >= 150 ? 8 : 7;
    const base = Math.floor(totalSeconds / count);
    const rem = totalSeconds - base * count;
    const roles = ['悬念开场', '痛点切入', '现象实测', '细节微距', '底层反转', '实操步骤', '真实避坑', '判词收尾'];
    segments = Array.from({ length: count }, (_, idx) => ({
      role: roles[idx] || `段落 ${idx + 1}`,
      sec: base + (idx === count - 1 ? rem : 0)
    }));
  }

  const shotTemplates = [
    {
      shotSize: '俯拍/微距特写',
      cameraMove: '固定机位（浅景深）',
      sceneGroup: 'A组·特写',
      visualAction: `暖侧光照亮与「${t}」绑定的核心道具，手部利落放入画面，直接抓视觉焦点。`,
      dialogueType: 'VO 画外音',
      dialogue: idea?.hook3s?.replace(/^[“"]|[”"]$/g, '') || `别被表象骗了，关于「${t}」，大多数人第一步就看反了。`,
      soundDesign: '道具落桌脆响 + 0.4s 留白',
      postTip: '左上角极细编号角标'
    },
    {
      shotSize: '中近景',
      cameraMove: '浅景深固定 / 缓退跟拍 [CUT]',
      sceneGroup: 'B组·口播',
      visualAction: `主角首次正面入画，背景大光圈虚化；手持核心道具直视镜头，松弛定锚。`,
      dialogueType: '真人口播',
      dialogue: `以前我也在「${t}」上踩过坑，总以为堆表面功夫就够了，拆开复盘才发现不是。`,
      soundDesign: '近场清晰人声 + 轻环境底噪',
      postTip: '底部极简单行白字幕'
    },
    {
      shotSize: '微距特写',
      cameraMove: '极缓推近',
      sceneGroup: 'A组·特写',
      visualAction: `手部特写指认「${t}」最易忽略的关键细节，用具体物证替代抽象说教。`,
      dialogueType: 'VO 画外音',
      dialogue: `真正拉开差距的，不是花时间最多的 80%，而是藏在光线、节奏和信息密度里的这个开关。`,
      soundDesign: '清晰摩擦/点击物理原声',
      postTip: '1px 细线框标出关键词'
    },
    {
      shotSize: '中景对比',
      cameraMove: '同机位匹配跳剪 [CUT]',
      sceneGroup: 'C组·空镜',
      visualAction: `展示普通做法与「${archetype}」升级版的直观画面落差，一眼看懂差异。`,
      dialogueType: 'VO 画外音',
      dialogue: `换掉这一步，信息更聚焦、画面更干净，单人轻资产也能拍出大片观感。`,
      soundDesign: '切镜瞬间加轻脆咔哒声',
      postTip: '极简 BEFORE / AFTER 标签'
    },
    {
      shotSize: '近景侧转正',
      cameraMove: '静态微推',
      sceneGroup: 'B组·口播',
      visualAction: `切回主角近景，语速略放慢，给出观众今天就能照做验证的 1 个具体动作。`,
      dialogueType: '真人口播',
      dialogue: `下次拍「${t}」，先别堆素材：前 3 秒给视觉奇观，中段只讲透一个真相。`,
      soundDesign: '人声贴耳，底噪微收',
      postTip: '右侧轻量弹出 3 步要点'
    },
    {
      shotSize: '中近景缓推',
      cameraMove: '缓推 + 尾帧留白 1s',
      sceneGroup: 'B组·口播',
      visualAction: `主角放下道具直视镜头淡笑，定格 1 秒后自然切黑落版。`,
      dialogueType: '真人口播',
      dialogue: `真正的高级感从不是堆出来的，而是删掉废话后留下的那句真话。评论区聊聊？`,
      soundDesign: '金句前停顿 0.5s + 尾帧环境音收尾',
      postTip: '极简落版 + 轻互动提问'
    }
  ];

  let cursor = 0;
  return segments.map((seg, index) => {
    const tpl =
      index === segments.length - 1
        ? shotTemplates[shotTemplates.length - 1]
        : shotTemplates[index % (shotTemplates.length - 1)];
    const startSec = cursor;
    const endSec = cursor + seg.sec;
    cursor = endSec;
    const fmt = (n) => `00:${String(n).padStart(2, '0')}`;
    return {
      shotNumber: index + 1,
      phase: seg.role,
      timecode: `${fmt(startSec)}–${fmt(endSec)}`,
      seconds: seg.sec,
      shotSize: tpl.shotSize,
      cameraMove: tpl.cameraMove,
      sceneGroup: tpl.sceneGroup,
      visualAction: tpl.visualAction,
      dialogueType: tpl.dialogueType,
      dialogue: tpl.dialogue,
      soundDesign: tpl.soundDesign,
      postTip: tpl.postTip
    };
  });
}

export async function runSandboxStage(stage, context = {}) {
  await sleep(120);

  const topic = String(context.topic || '自媒体选题').trim();
  const platform = context.platform || 'auto';
  const lockedSeconds = context.targetSeconds ? Number(context.targetSeconds) : null;
  const domain = detectDomain(topic);

  if (stage === 'duration_mapper') {
    const toolEstimate = context.toolEstimate || estimateDurationAndPacing({ topic, platform, lockedSeconds });
    return {
      data: {
        topicCategory: domain.label,
        recommendedSeconds: toolEstimate.recommendedSeconds,
        durationLabel: toolEstimate.durationLabel,
        rationale: `「${domain.label}」类选题映射 ${toolEstimate.recommendedSeconds} 秒（约 ${toolEstimate.wordBudget.ideal} 字 / ${toolEstimate.recommendedShots} 镜），前 3 秒抓人且留足呼吸感。`,
        wordBudget: toolEstimate.wordBudget,
        recommendedShots: toolEstimate.recommendedShots,
        pacingCurve: toolEstimate.pacingCurve,
        alternatives: toolEstimate.alternatives,
        platformAdvice: toolEstimate.platformAdvice
      },
      thoughtSummary: `识别赛道「${domain.label}」→ 主推 ${toolEstimate.recommendedSeconds}s（${toolEstimate.wordBudget.charsPerSecond} 字/秒）。`,
      usage: { inputTokens: 320, cachedTokens: 0, outputTokens: 260, reasoningTokens: 210, totalTokens: 790 }
    };
  }

  if (stage === 'idea_generator') {
    const baseSeconds = context.durationPlan?.recommendedSeconds || lockedSeconds || 45;
    const count = Math.max(4, Math.min(8, Number(context.ideaCount) || 6));
    const batchIndex = Number(context.batchIndex) || 0;
    const allTemplates = [
      ...buildIdeaTemplates(topic, domain, baseSeconds, platform, batchIndex),
      ...buildIdeaTemplates(topic, domain, baseSeconds, platform, batchIndex + 1)
    ];
    const existingTitles = new Set(context.excludeTitles || []);
    const picked = [];
    for (const item of allTemplates) {
      if (existingTitles.has(item.title)) continue;
      picked.push(item);
      if (picked.length >= count) break;
    }
    return {
      data: {
        creativeDirectionSummary: `已生成 ${picked.length} 个互斥方向，覆盖单人桌面到外景实测。`,
        ideas: picked
      },
      thoughtSummary: `已发散 ${picked.length} 个不同叙事原型。`,
      usage: { inputTokens: 540, cachedTokens: 200, outputTokens: 820, reasoningTokens: 480, totalTokens: 1840 }
    };
  }

  if (stage === 'script_architect') {
    const idea = context.idea || buildIdeaTemplates(topic, domain, lockedSeconds || 45, platform, 0)[0];
    const totalSeconds = Number(context.overrideSeconds || idea.mappedSeconds || context.durationPlan?.recommendedSeconds || 45);
    const shots = buildStoryboardShots(topic, idea, totalSeconds);
    const totalChars = shots.reduce((sum, s) => sum + (s.dialogue || '').replace(/\s+/g, '').length, 0);

    const script = {
      title: idea.title,
      subtitle: `${domain.label} · ${idea.archetype} · ${totalSeconds}秒`,
      targetSeconds: totalSeconds,
      aspectRatio: domain.aspectRatio,
      platformFit: idea.platformFit || (platform === 'auto' ? '抖音 / 小红书' : platform),
      summary: {
        coreThesis: `用「${idea.archetype}」切入「${shortTopic(topic)}」，以画面证据替代空洞说教。`,
        openingHook: idea.hook3s,
        creativePoints: [
          idea.creativeTwist,
          `全片约 ${totalChars} 字，严格贴合 ${totalSeconds} 秒自然语速。`,
          '50% 画面用特写/空镜 VO，大幅减少露脸背稿 NG。'
        ],
        storyLogicChain: ['01 视觉反差锁注意力', '02 场景人设定锚', '03 物证细节拆解', '04 金句收尾引互动'],
        shareTriggers: ['低门槛可抄作业细节（收藏）', '反共识判词（评论转发）'],
        titleOptions: [
          idea.title,
          `${totalSeconds}秒看透「${shortTopic(topic)}」的隐藏真相`,
          `关于「${shortTopic(topic)}」，一条值钱的实拍笔记`
        ],
        coverConcept: '9:16 主体居中浅景深特写 + 底部 ≤10 字极简大标题，无花字描边。'
      },
      visualAesthetics: {
        lookAndFeel: idea.visualMood || domain.lookStyle,
        colorPalette: domain.palette,
        lightingPlan: '关掉吸顶灯，仅用单盏 45° 侧顶柔光或下午窗边自然侧逆光。',
        cameraStyle: '统一 35mm / 手机 2x 焦段，固定机位为主，结论处缓慢推进。',
        soundDesign: domain.soundStrategy,
        subtitleAndPackaging: '底部单行无描边白字，关键处用极细 1px 标签，尾帧留白 1s。'
      },
      storyboard: shots,
      productionPlan: {
        estimatedPrepTime: '筹备 20分 · 拍摄 60分 · 剪辑 30分',
        estimatedBudget: idea.budgetTier || '<100元',
        locationSuggestion: domain.key === 'business' ? '免费街区/咖啡馆靠窗位' : '自然光靠窗桌面（清理杂物）',
        equipmentAndProps: domain.props,
        shootingOrder: [
          {
            step: 1,
            group: '先拍 B组·露脸口播',
            shotsIncluded: shots.filter((s) => s.sceneGroup.startsWith('B组')).map((s) => `#${s.shotNumber}`).join('、') || '口播镜',
            action: '架好灯麦一次连拍 2–3 条口播，句间留半秒气口方便剪辑。'
          },
          {
            step: 2,
            group: '再拍 A组·特写俯拍',
            shotsIncluded: shots.filter((s) => s.sceneGroup.startsWith('A组')).map((s) => `#${s.shotNumber}`).join('、') || '特写镜',
            action: '切俯拍/微距补齐手部道具动作与清晰物理原声，动作前后多留 2s。'
          },
          {
            step: 3,
            group: '最后补 C组·空镜',
            shotsIncluded: shots.filter((s) => s.sceneGroup.startsWith('C组')).map((s) => `#${s.shotNumber}`).join('、') || '空镜',
            action: '补拍 3 条 5 秒以上光影/环境空镜，用于 VO 铺底与跳剪兜底。'
          }
        ],
        antiNgTips: [
          '露脸仅需背 1–2 句短句，其余 VO 拍完画面后看手机从容录音。',
          '现场单独录 10 秒安静底噪，后期垫音缝瞬间显专业。'
        ],
        postProductionSteps: [
          '1. 声音先行粗剪：删掉气口卡死精准时长。',
          '2. 铺叠 B-Roll：每 3–5 秒至少一次景别变化。',
          '3. 音效调色：对齐物理音效、套统一胶片 LUT、导封面。'
        ]
      }
    };

    return {
      data: script,
      thoughtSummary: `${totalSeconds}s 共 ${shots.length} 镜 · 口播 ${totalChars} 字 · 合并 3 组顺场拍法。`,
      usage: { inputTokens: 880, cachedTokens: 400, outputTokens: 1450, reasoningTokens: 860, totalTokens: 3190 }
    };
  }

  if (stage === 'shootability_reviewer') {
    const script = context.script;
    const deterministic = auditScriptTimingAndWordcount(script);
    return {
      data: {
        overallScore: deterministic.score,
        verdict: deterministic.score >= 88 ? '可直接开拍' : '微调后开拍',
        strengths: ['前 3 秒有明确声画钩子', '已按机位合并顺场拍摄顺序'],
        risks: deterministic.issues.length ? deterministic.issues.slice(0, 2) : ['注意统一前后镜头色温，避免日光与暖灯混光'],
        optimizationSuggestions: ['压缩成 30 秒高密切片版', '改成单人手机超低成本版'],
        metrics: deterministic.metrics
      },
      thoughtSummary: `质检 ${deterministic.score} 分 · 语速 ${deterministic.metrics.charsPerSecond} 字/秒。`,
      usage: { inputTokens: 640, cachedTokens: 380, outputTokens: 260, reasoningTokens: 280, totalTokens: 1180 }
    };
  }

  if (stage === 'script_refiner') {
    const base = structuredClone(context.script);
    const instruction = String(context.instruction || '').trim();
    const secMatch = instruction.match(/(\d{2,3})\s*(?:秒|s|S)/);
    let nextSeconds = base.targetSeconds || 45;
    if (secMatch) nextSeconds = Math.max(15, Math.min(180, Number(secMatch[1])));
    else if (/缩短|压缩|更短|切片/.test(instruction)) nextSeconds = Math.max(15, Math.min(30, nextSeconds - 15));
    else if (/拉长|扩写|更深/.test(instruction)) nextSeconds = Math.min(180, nextSeconds + 30);

    const updatedIdea = {
      title: base.title,
      archetype: /反转|冲突|犀利/.test(instruction) ? '强冲突精修' : '精修版',
      hook3s: /钩子|开头|前3秒|前 3 秒/.test(instruction)
        ? `“停一下！关于「${shortTopic(topic)}」，这 ${nextSeconds} 秒直接省掉一半弯路。”`
        : base.summary?.openingHook,
      visualMood: /暗调|黑金|电影/.test(instruction)
        ? '黑金暗调 · 单束聚光灯浅景深'
        : /手机|单人|低成本/.test(instruction)
          ? '单人手机自然光 · 2x 人像长焦'
          : base.visualAesthetics?.lookAndFeel,
      budgetTier: /手机|低成本|零成本|单人/.test(instruction) ? '<30元' : base.productionPlan?.estimatedBudget,
      creativeTwist: `精修重点：${instruction.slice(0, 32)}`
    };

    const rebuilt = (
      await runSandboxStage('script_architect', {
        topic,
        platform,
        idea: updatedIdea,
        overrideSeconds: nextSeconds
      })
    ).data;
    rebuilt.title = base.title.includes('（精修）') ? base.title : `${base.title}（精修）`;
    return {
      data: rebuilt,
      thoughtSummary: `已按「${instruction.slice(0, 24)}」重排为 ${nextSeconds}s（${rebuilt.storyboard.length} 镜）。`,
      usage: { inputTokens: 920, cachedTokens: 420, outputTokens: 1380, reasoningTokens: 760, totalTokens: 3060 }
    };
  }

  throw new Error(`未知沙盒阶段: ${stage}`);
}
