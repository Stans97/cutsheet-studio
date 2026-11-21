import { estimateDurationAndPacing, auditScriptTimingAndWordcount } from '../agents/tools.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectDomain(topic) {
  const text = String(topic || '');
  if (/商业|店|品牌|流量|定价|消费|经济|赚钱|咖啡|奶茶|安福路|商场|网红|生意|尽调|溢价/.test(text)) {
    return {
      key: 'business',
      label: '商业洞察与城市观察',
      lookStyle: '35mm 城市纪实胶片感 · 暖金侧逆光 + 浅景深',
      palette: ['#1E1C1A', '#C89B54', '#E8DFCF', '#8C3B2B'],
      aspectRatio: '9:16',
      soundStrategy: '保留街头脚步声、咖啡冰块轻碰与环境底噪，弱化廉价配乐，突出低沉克制口播',
      props: [
        { item: '35mm / 50mm 大光圈定焦镜头（或手机 2x 人像长焦）', cost: '自有 / 0元', purpose: '压缩背景人群，制造杂志封面级景深' },
        { item: '无线领夹麦（带防风毛套）', cost: '自有 / 200元级', purpose: '保证户外街景同期声干净、人声贴耳' },
        { item: '核心道具（如透明冰美式 / 实测账单 / 实物样本）', cost: '20–50元', purpose: '给手部动作支点，消除面对镜头尴尬' }
      ]
    };
  }
  if (/租房|家居|改造|房间|桌面|收纳|卧室|客厅|装修|软装|极简/.test(text)) {
    return {
      key: 'home',
      label: '空间美学与低成本改造',
      lookStyle: '自然日光杂志风 · 干净冷暖对比（Before 杂乱冷灰 → After 暖白原木）',
      palette: ['#F4EFE6', '#C9A87C', '#4A554C', '#2B2824'],
      aspectRatio: '9:16',
      soundStrategy: '放大开箱、贴膜、开关灯“咔哒”声等 ASMR 物理音效，转场后渐入轻盈原声吉他',
      props: [
        { item: '三脚架固定机位（必须锁死同一机位拍 Before/After）', cost: '自有 / 80元', purpose: '实现无缝对比跳剪，观感爽感翻倍' },
        { item: '2700K 暖色氛围灯带或台灯', cost: '39–69元', purpose: '关掉吸顶惨白灯，瞬间拉出高级明暗层次' },
        { item: '改造核心软装/收纳小物 2–3 件', cost: '100元内', purpose: '制造高性价比落地爽点，触发评论区求链接' }
      ]
    };
  }
  if (/AI|科技|数码|效率|工具|手机|电脑|软件|代码|相机|评测|测评/.test(text)) {
    return {
      key: 'tech',
      label: '硬核实测与效率工作流',
      lookStyle: '低饱和黑灰桌面微距 · 单灯硬光勾边 + 清晰屏幕特写',
      palette: ['#141619', '#2E3440', '#D08770', '#ECEFF4'],
      aspectRatio: '16:9',
      soundStrategy: '清脆键盘敲击声、鼠标点击与节奏鼓点切片，逻辑转折处加轻微 Whoosh 提示音',
      props: [
        { item: '哑光深色桌垫 + 顶部俯拍支架', cost: '60元', purpose: '统一俯拍画面洁净度，避免桌面反光杂乱' },
        { item: '60W 常亮灯 + 格栅柔光箱（45° 侧顶打光）', cost: '已有或租赁 50元', purpose: '压暗背景只留桌面与人像轮廓光' },
        { item: '录屏软件（高帧率局部放大关键操作）', cost: '0元', purpose: '用真实对比演示替代干巴巴口头安利' }
      ]
    };
  }
  if (/职场|离职|面试|副业|焦虑|沟通|成长|思维|习惯|自律|读书/.test(text)) {
    return {
      key: 'career',
      label: '深度认知与个体叙事',
      lookStyle: '深夜窗边对谈质感 · 半侧逆光 + 克制中近景构图',
      palette: ['#1B1F23', '#3D4852', '#D4A373', '#F5F1EB'],
      aspectRatio: '9:16',
      soundStrategy: '近场人声收音，配合极低音量氛围铺底（-28dB），金句前刻意停顿 0.8 秒制造呼吸感',
      props: [
        { item: '笔记本 + 粗笔 / 咖啡杯 / 手机备忘录特写', cost: '0–30元', purpose: '穿插 35% 手部与环境空镜，降低全程盯镜头的背稿压力' },
        { item: '单盏暖色落地灯或靠窗自然逆光', cost: '0元', purpose: '在卧室/咖啡馆角落就能拍出深度播客访谈氛围' },
        { item: '提词器 App（架在镜头正下方 1.2 米）', cost: '0元', purpose: '控制眼神不飘移，保证一镜到底自然松弛' }
      ]
    };
  }
  if (/美食|做饭|探店|餐厅|甜品|咖啡|早餐|减脂|菜谱/.test(text)) {
    return {
      key: 'food',
      label: '食欲美学与烟火纪实',
      lookStyle: '高质感暖调微距 · 逆光蒸汽高光 + 浅景深特写',
      palette: ['#231915', '#B8522A', '#E6B86A', '#FAF3E7'],
      aspectRatio: '9:16',
      soundStrategy: '全程高敏收录热油滋啦声、切菜脆响、倒水声，口播轻快克制，让声音先勾出食欲',
      props: [
        { item: '逆光小灯（从食物后斜上方打亮蒸汽与油润高光）', cost: '80元', purpose: '食物拍出高级感的核心秘诀永远是“背光轮廓”' },
        { item: '哑光深色餐盘 + 原木砧板', cost: '45元', purpose: '衬托食材鲜亮饱和度，避免亮白瓷盘过曝' },
        { item: '手机微距/2x 焦段 + 俯拍悬臂', cost: '自有', purpose: '近距离捕捉酱汁滑落与切开瞬间的视觉高潮' }
      ]
    };
  }
  return {
    key: 'editorial',
    label: '杂志感观点与真实体验',
    lookStyle: '低饱和胶片叙事 · 自然光影层次 + 手持呼吸感运镜',
    palette: ['#1C1A17', '#C2412D', '#D9CBB8', '#F6F2EA'],
    aspectRatio: '9:16',
    soundStrategy: '优先保留现场物理环境原声，辅以极简节奏音效做段落切分，拒绝满铺土味 BGM',
    props: [
      { item: '主拍摄设备（微单 35mm / 手机 4K 24fps + 2x 焦段）', cost: '自有', purpose: '保证人像不变形且背景具备柔和压缩感' },
      { item: '无线领夹麦 + 小型补光灯/反光板', cost: '150元级', purpose: '音质清晰度决定 70% 的视频“高级感”' },
      { item: '与主题强绑定的 1 件核心“视觉证物”道具', cost: '0–50元', purpose: '前 3 秒入画做强视觉抓手，贯穿全片收束' }
    ]
  };
}

function shortTopic(topic) {
  const clean = String(topic || '').trim().replace(/[？?！!。]+$/, '');
  return clean.length > 22 ? `${clean.slice(0, 22)}…` : clean;
}

function buildIdeaTemplates(topic, domain, baseSeconds, platform, batchIndex = 0) {
  const t = shortTopic(topic);
  const sShort = Math.max(15, Math.min(30, Math.round(baseSeconds * 0.65 / 15) * 15 || 30));
  const sMain = baseSeconds;
  const sLong = Math.min(180, Math.max(60, Math.round(baseSeconds * 1.5 / 15) * 15 || 90));

  const poolA = [
    {
      id: `idea_${batchIndex}_1`,
      archetype: '反常识揭秘',
      title: `别被表象骗了：拆穿「${t}」背后的真实账本`,
      hook3s: `“表面看大家都在追「${t}」，但你只要换个角度算一笔账，就会发现 90% 的人都看反了。”`,
      mappedSeconds: sMain,
      platformFit: platform === 'auto' ? '抖音 / 视频号 / 小红书' : platform,
      creativeTwist: '跳过泛泛科普，直接从“反直觉真相 + 隐性成本/收益拆解”切入，用 1 个具体细节推翻大众默认印象。',
      visualMood: domain.lookStyle,
      difficulty: '轻资产 · 单人/双人 2 小时可拍完',
      budgetTier: '低成本（<100元）',
      logicHighlight: '奇观开场 → 剥开第一层误区 → 甩出底层机制 → 截图级金句收尾',
      viralPotential: '强反差认知差极易引发评论区争论与收藏转发'
    },
    {
      id: `idea_${batchIndex}_2`,
      archetype: '器物微距拆解',
      title: `只拍 3 个微距细节，看懂「${t}」的高级感密码`,
      hook3s: `“不用听复杂道理，盯着眼前这 3 个不起眼的细节，30 秒就能看透「${t}」。”`,
      mappedSeconds: sShort,
      platformFit: platform === 'auto' ? '小红书 / 抖音' : platform,
      creativeTwist: '60% 以上画面用 90° 俯拍或微距拍手部与核心道具，把抽象主题具象成可触摸的“物证”，零背稿压力且观感极高级。',
      visualMood: '低饱和黑石/素色桌面微距 · 单盏顶侧硬光 + 极简衬线标注',
      difficulty: '极易实拍 · 单人桌面固定机位',
      budgetTier: '超低成本（<50元）',
      logicHighlight: '俯拍物证落桌声开场 → 三步微距指认细节 → 抬头一句判词定格',
      viralPotential: '画面高度干净抓眼，前 3 秒滑走率极低，适合批量套模板周更'
    },
    {
      id: `idea_${batchIndex}_3`,
      archetype: '沉浸式第一视角',
      title: `我用一整天亲测「${t}」：镜头不剪辑的真实记录`,
      hook3s: `“全网都在夸「${t}」，今天我不讲废话，带镜头从第一分钟开始真实体验。”`,
      mappedSeconds: sLong,
      platformFit: platform === 'auto' ? 'B站 / 小红书 / YouTube' : platform,
      creativeTwist: '用“时间轴倒计时 + POV 第一视角 + 真实情绪微表情”建立强代入感，故意保留 1 个真实踩坑小插曲增强信任度。',
      visualMood: '自然光手持跟拍 · 第一视角切换特写 · 同期现场环境声',
      difficulty: '中等 · 需外出或分时段记录素材',
      budgetTier: '中低成本（按场景实付）',
      logicHighlight: '设定实验挑战 → 关键节点真实反馈 → 意外转折 → 坦诚给结论与避坑清单',
      viralPotential: '真实感与参与感最强，观众会为了看“最后结果到底怎样”拉满完播率'
    },
    {
      id: `idea_${batchIndex}_4`,
      archetype: '对照组强反转',
      title: `同样是「${t}」，为什么有人做出来廉价，有人像大片？`,
      hook3s: `“左边的做法 99% 新手都会踩坑，只改掉这一个动作，右边质感直接翻倍。”`,
      mappedSeconds: sMain,
      platformFit: platform === 'auto' ? '抖音 / 小红书' : platform,
      creativeTwist: '用分屏或“错误示范 vs 正确升级”强对比结构，每一段都有肉眼可见的视觉前后落差，干货获得感直接拉满。',
      visualMood: '前半冷灰平光杂乱感 → 打响指/遮挡转场 → 后半暖金浅景深质感',
      difficulty: '轻资产 · 固定三脚架同机位即可',
      budgetTier: '低成本（<80元）',
      logicHighlight: '痛点直击对比 → 拆解 3 个低成本改动动作 → 最终成品定格对比',
      viralPotential: '“抄作业型”收藏率最高，评论区自然出现大量实操提问'
    },
    {
      id: `idea_${batchIndex}_5`,
      archetype: '故事冲突切入',
      title: `差点放弃「${t}」那天，一个意外瞬间彻底改变了我`,
      hook3s: `“如果上周我没把那条「${t}」相关的决定按暂停键，我现在可能还在原地打转。”`,
      mappedSeconds: sMain,
      platformFit: platform === 'auto' ? '视频号 / 抖音 / B站' : platform,
      creativeTwist: '先抛情绪危机或真实窘境，用微纪录片式个人叙事包裹干货观点，让观众先共情“人”，再认同“观点”。',
      visualMood: '黄昏/夜色窗边逆光 · 电影感宽画幅留白 · 缓慢推进镜头',
      difficulty: '轻资产 · 室内外单机位即可',
      budgetTier: '极低成本（0–30元）',
      logicHighlight: '危机切面开场 → 回溯核心卡点 → 顿悟转折动作 → 给同类人的温柔判词',
      viralPotential: '转发给朋友和私信共鸣度最高，能快速沉淀高粘性铁粉'
    },
    {
      id: `idea_${batchIndex}_6`,
      archetype: '极速三连清单',
      title: `关于「${t}」的 3 条反直觉铁律，第 3 条没人敢明说`,
      hook3s: `“关于「${t}」，越早知道这 3 条潜规则，越能少走半年弯路，尤其最后一条。”`,
      mappedSeconds: sShort,
      platformFit: platform === 'auto' ? '抖音 / 视频号' : platform,
      creativeTwist: '高密度快切节奏 + 阶梯式递进信息（浅层技巧 → 核心心法 → 行业真相），配合大字节奏卡点与动作切换。',
      visualMood: '明快干净高对比 · 三个场景动作无缝跳剪（走动/坐姿/特写）',
      difficulty: '极易实拍 · 1 小时可连拍 3 条',
      budgetTier: '零成本（手机可拍）',
      logicHighlight: '抛出稀缺承诺 → 10 秒一条密集输出 → 留钩子引导评论区对号入座',
      viralPotential: '最稳健的起号基本盘结构，信息密度高、点赞收藏转化直接'
    }
  ];

  const poolB = [
    {
      id: `idea_${batchIndex}_7`,
      archetype: '街头随机验证',
      title: `拿着「${t}」的结论去问路人，结果比想象更扎心`,
      hook3s: `“网上对「${t}」吵翻了，我直接把问题搬到真实街头，听听普通人第一反应。”`,
      mappedSeconds: sLong,
      platformFit: platform === 'auto' ? '抖音 / B站' : platform,
      creativeTwist: '打破演播室自说自话，用 2–3 组极具反差的真实对话切片验证观点，制造天然戏剧张力。',
      visualMood: '手持纪实感街拍 · 35mm 抓拍真实表情 · 现场同期人声',
      difficulty: '中高 · 需外出采访与授权',
      budgetTier: '低成本（交通与小礼品）',
      logicHighlight: '抛出争议命题 → 3 组反差回答快剪 → 博主回到画面做犀利总结',
      viralPotential: '天然具备社会议题讨论度，评论区互动率极高'
    },
    {
      id: `idea_${batchIndex}_8`,
      archetype: '时间压缩蒙太奇',
      title: `把「${t}」的 30 天变化压缩进 30 秒，第 18 秒开始质变`,
      hook3s: `“坚持围绕「${t}」只改一个小动作，第 1 天像笑话，第 18 天画面突然变了。”`,
      mappedSeconds: sShort,
      platformFit: platform === 'auto' ? '小红书 / 抖音 / YouTube Shorts' : platform,
      creativeTwist: '用固定机位延时或跨天同构图卡点剪辑，让时间本身成为叙事张力，几乎无需长篇口播解释。',
      visualMood: '同机位多日匹配剪辑 · 暖调胶片颗粒 · 节拍声效递进',
      difficulty: '中等 · 需跨周期留存素材',
      budgetTier: '极低成本（0元）',
      logicHighlight: '结果预告钩子 → 快速推进过程变化 → 定格质变瞬间 + 复盘方法',
      viralPotential: '视觉爽感极强，跨越语言门槛，完播与复播率极佳'
    },
    {
      id: `idea_${batchIndex}_9`,
      archetype: '拆解爆款案例',
      title: `为什么别人靠「${t}」轻松破百万，我们照抄却没流量？`,
      hook3s: `“同样讲「${t}」，为什么那条视频能拿百万赞？我逐帧拉片后发现了 2 个暗线。”`,
      mappedSeconds: sMain,
      platformFit: platform === 'auto' ? 'B站 / 小红书 / 视频号' : platform,
      creativeTwist: '以“同行/专业拆解视角”切入，用拉片定格、手绘圈注或桌面笔记把隐藏结构一层层剥开。',
      visualMood: '演播桌面 + 屏幕局部特写 + 极细标注线框',
      difficulty: '轻资产 · 室内桌面半小时出片',
      budgetTier: '零成本（已有设备）',
      logicHighlight: '抛出高对比悬念 → 逐帧拆解前 3 秒与中段留存设计 → 给出可直接复用的 1 个公式',
      viralPotential: '精准吸引高价值垂直粉丝，收藏率与私信咨询转化突出'
    },
    {
      id: `idea_${batchIndex}_10`,
      archetype: '极简暗场独白',
      title: `关于「${t}」，我想说一句不太讨喜但很值钱的实话`,
      hook3s: `“这句话讲完可能会得罪不少人，但关于「${t}」，你迟早要面对这个现实。”`,
      mappedSeconds: sMain,
      platformFit: platform === 'auto' ? '视频号 / 抖音' : platform,
      creativeTwist: '去掉一切花哨转场，用单灯明暗对比、极克制的慢推镜头和刀刀见骨的精准表达建立“高辨识度主理人 IP”。',
      visualMood: '大卫·芬奇式低饱和暗调 · 单侧轮廓光 · 极简黑底衬线字幕',
      difficulty: '极易实拍 · 关顶灯 + 一盏主灯即可',
      budgetTier: '超低成本（<60元）',
      logicHighlight: '反共识声明定锚 → 举一个扎心生活切面 → 拆穿核心悖论 → 留白 1.5 秒收尾',
      viralPotential: '最能建立高客单个人 IP 辨识度，容易沉淀高净值受众'
    }
  ];

  return batchIndex % 2 === 0 ? poolA : poolB;
}

function buildStoryboardShots(topic, idea, totalSeconds, domain) {
  const t = shortTopic(topic);
  const archetype = idea?.archetype || '反常识揭秘';

  // Build exact second allocations summing to totalSeconds
  let segments;
  if (totalSeconds <= 20) {
    const s1 = Math.max(3, Math.round(totalSeconds * 0.25));
    const s2 = Math.max(5, Math.round(totalSeconds * 0.45));
    const s3 = totalSeconds - s1 - s2;
    segments = [
      { role: '黄金钩子', sec: s1 },
      { role: '核心反转', sec: s2 },
      { role: '金句封喉', sec: s3 }
    ];
  } else if (totalSeconds <= 35) {
    const s1 = 6;
    const s2 = 8;
    const s3 = 9;
    const s4 = totalSeconds - s1 - s2 - s3;
    segments = [
      { role: '视觉奇观钩子', sec: s1 },
      { role: '抛出反差误区', sec: s2 },
      { role: '核心干货/真相拆解', sec: s3 },
      { role: '金句定格收束', sec: s4 }
    ];
  } else if (totalSeconds <= 55) {
    const s1 = 5;
    const s2 = 10;
    const s3 = 12;
    const s4 = 10;
    const s5 = totalSeconds - s1 - s2 - s3 - s4;
    segments = [
      { role: '前5秒强钩子', sec: s1 },
      { role: '建立现场与痛点', sec: s2 },
      { role: '第一层底层逻辑拆解', sec: s3 },
      { role: '具象细节/案例佐证', sec: s4 },
      { role: '情绪升华与行动落版', sec: s5 }
    ];
  } else if (totalSeconds <= 75) {
    const s1 = 5;
    const s2 = 10;
    const s3 = 13;
    const s4 = 12;
    const s5 = 11;
    const s6 = totalSeconds - s1 - s2 - s3 - s4 - s5;
    segments = [
      { role: '前5秒强视觉钩子', sec: s1 },
      { role: '场景锚定与人设出场', sec: s2 },
      { role: '表象拆穿（第一重转折）', sec: s3 },
      { role: '关键物证/实操细节微距', sec: s4 },
      { role: '底层规律与避坑对比', sec: s5 },
      { role: '截图级金句与评论钩子', sec: s6 }
    ];
  } else {
    const count = totalSeconds >= 150 ? 8 : 7;
    const base = Math.floor(totalSeconds / count);
    const rem = totalSeconds - base * count;
    const roles = [
      '黄金3秒悬念开场',
      '真实痛点与背景切入',
      '第一层实测/现象观察',
      '核心细节特写拆解',
      '关键反转与底层账本',
      '可抄作业的执行步骤',
      '常见误区与真实避坑',
      '总结判词与互动收尾'
    ];
    segments = Array.from({ length: count }, (_, idx) => ({
      role: roles[idx] || `推进段落 ${idx + 1}`,
      sec: base + (idx === count - 1 ? rem : 0)
    }));
  }

  const shotTemplates = [
    {
      shotSize: '特写 / 90° 俯拍特写',
      cameraMove: '固定机位或极缓推进（35mm 浅景深）',
      sceneGroup: 'A组 · 核心细节/桌面或环境特写',
      visualAction: `开场直接切入与「${t}」强绑定的高质感画面：自然光或单侧暖光照亮主体细节，手部利落放入关键道具/触发动作，不废话直接制造视觉好奇。`,
      dialogueType: 'VO 画外音',
      dialogue: idea?.hook3s?.replace(/^[“"]|[”"]$/g, '') || `别被表面热闹骗了，关于「${t}」，绝大多数人从第一步就看反了。`,
      soundDesign: '清脆物理触发声（道具落桌/环境原声/快门声）+ 0.4秒静默留白拉注意力',
      postTip: '左上角极细衬线角标提示主题编号；前 2 秒画面干净不堆花字'
    },
    {
      shotSize: '中近景（胸口以上）',
      cameraMove: '正面微后退跟拍 / 浅景深固定 [CUT]',
      sceneGroup: 'B组 · 主角露脸口播主机位',
      visualAction: `主角首次正面入画，背景保持大光圈虚化光斑。神态松弛笃定，手部自然持有核心道具，视线直视镜头完成人设定锚。`,
      dialogueType: '真人口播',
      dialogue: `以前我也在「${t}」上踩过坑，总觉得把表面功夫做足就够了，直到把整套流程拆开复盘。`,
      soundDesign: '干净近场人声 + 轻柔环境底噪（-30dB），保持纪实呼吸感',
      postTip: '底部极简单行白字字幕（无描边无阴影），关键词可微调暖红/琥珀色'
    },
    {
      shotSize: '微距特写 + 中景切镜',
      cameraMove: '缓慢横移推近（突出层次变化）',
      sceneGroup: 'A组 · 核心细节/桌面或环境特写',
      visualAction: `切回手部与主体细节特写，用笔尖/手指明确点出「${t}」中最容易被忽略的核心变量，制造“原来如此”的视觉证据链。`,
      dialogueType: 'VO 画外音',
      dialogue: `真正决定「${t}」成败的，从来不是你花最多时间的那 80%，而是藏在光线、节奏和信息密度里的这一个开关。`,
      soundDesign: '清晰物体摩擦/点击物理音效，搭配极轻低频转场提示',
      postTip: '在关键细节旁弹出极细 1px 引导线与 4–6 字英文/中文标签'
    },
    {
      shotSize: '中景 / 对比双画面',
      cameraMove: '同机位匹配跳剪 [CUT]',
      sceneGroup: 'C组 · 场景实证/对比空镜',
      visualAction: `直观呈现调整前后的观感落差（或“普通做法 vs 进阶方案”对照），让观众无需思考就能一眼看见差异。`,
      dialogueType: 'VO 画外音',
      dialogue: `按「${archetype}」的思路换掉这一步，信息更聚焦、画面更干净，哪怕单人轻资产拍摄也能稳稳撑起大片观感。`,
      soundDesign: '对比切换瞬间配清脆机械“咔哒”声，强化节奏爽点',
      postTip: '对比帧上方轻量标注 `BEFORE / AFTER` 或 `常见误区 / 进阶方案`'
    },
    {
      shotSize: '近景侧拍转正',
      cameraMove: '手持轻缓环绕或静态微推',
      sceneGroup: 'B组 · 主角露脸口播主机位',
      visualAction: `回到主角近景，语速略微放慢，给出一条观众今天就能立刻照做验证的落地动作。`,
      dialogueType: '真人口播',
      dialogue: `你下次碰见「${t}」，先别急着堆素材，试着把前 3 秒做成视觉奇观、中段只讲透一个真相。`,
      soundDesign: '人声清晰贴耳，环境音略微收敛突出观点分量',
      postTip: '屏幕右侧极简列出 3 步要点卡片（淡入淡出，停留 2.5 秒）'
    },
    {
      shotSize: '中近景缓推定格',
      cameraMove: '镜头缓慢推进，尾帧留白 1.2 秒',
      sceneGroup: 'B组 · 主角露脸口播主机位',
      visualAction: `主角完成收尾动作（放下杯子/合上笔记/望向镜头淡笑），保持眼神从容克制，留 1 秒呼吸感后自然切黑落版。`,
      dialogueType: '真人口播',
      dialogue: `真正的高级感从来不是靠堆砌出来的，而是你敢删掉多余废话后，留下的那一句真话。你觉得呢？评论区聊聊。`,
      soundDesign: '最后一句前停顿 0.5 秒；尾帧清脆一声环境音效收尾，干净利落',
      postTip: '尾帧极简暗场/浅底品牌落版，叠加轻引导评论提问'
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
  // Subtle delay to make SSE pipeline progression feel natural and observable
  await sleep(160);

  const topic = String(context.topic || '自媒体爆款选题').trim();
  const platform = context.platform || 'auto';
  const lockedSeconds = context.targetSeconds ? Number(context.targetSeconds) : null;
  const domain = detectDomain(topic);

  if (stage === 'duration_mapper') {
    const toolEstimate = context.toolEstimate || estimateDurationAndPacing({ topic, platform, lockedSeconds });
    const data = {
      topicCategory: domain.label,
      recommendedSeconds: toolEstimate.recommendedSeconds,
      durationLabel: toolEstimate.durationLabel,
      rationale: `主题「${shortTopic(topic)}」属于「${domain.label}」赛道，具备明显的视觉展示与观点拆解空间。映射为 ${toolEstimate.recommendedSeconds} 秒（约 ${toolEstimate.wordBudget.ideal} 字口播 + ${toolEstimate.recommendedShots} 个核心镜头），既能在前 3 秒抛出反差钩子，又留足物理同期声与细节特写的呼吸空间，完播率与信息获得感最均衡。`,
      wordBudget: toolEstimate.wordBudget,
      recommendedShots: toolEstimate.recommendedShots,
      pacingCurve: toolEstimate.pacingCurve,
      alternatives: toolEstimate.alternatives,
      platformAdvice: toolEstimate.platformAdvice
    };
    return {
      data,
      thoughtSummary: `已完成主题信息密度与平台完播模型映射：识别赛道为「${domain.label}」，建议主推时长 ${toolEstimate.recommendedSeconds} 秒（语速控制在 ${toolEstimate.wordBudget.charsPerSecond} 字/秒，含留白缓冲）。`,
      usage: { inputTokens: 420, cachedTokens: 0, outputTokens: 380, reasoningTokens: 290, totalTokens: 1090 }
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
        creativeDirectionSummary: `围绕「${shortTopic(topic)}」从认知反差、器物微距、第一视角体验、对照组反转、故事共情与快节奏清单 ${picked.length} 个完全不同的叙事维度发散，覆盖轻资产单人拍到精致探访全场景。`,
        ideas: picked
      },
      thoughtSummary: `已强制隔离叙事原型，生成 ${picked.length} 个互斥创意方向，并分别匹配最优时长与拍摄成本分级。`,
      usage: { inputTokens: 680, cachedTokens: 240, outputTokens: 1120, reasoningTokens: 640, totalTokens: 2440 }
    };
  }

  if (stage === 'script_architect') {
    const idea = context.idea || buildIdeaTemplates(topic, domain, lockedSeconds || 45, platform, 0)[0];
    const totalSeconds = Number(context.overrideSeconds || idea.mappedSeconds || context.durationPlan?.recommendedSeconds || 45);
    const shots = buildStoryboardShots(topic, idea, totalSeconds, domain);
    const totalChars = shots.reduce((sum, s) => sum + (s.dialogue || '').replace(/\s+/g, '').length, 0);

    const script = {
      title: idea.title,
      subtitle: `${domain.label} · ${idea.archetype} · ${totalSeconds}秒实拍定稿方案`,
      targetSeconds: totalSeconds,
      aspectRatio: domain.aspectRatio,
      platformFit: idea.platformFit || (platform === 'auto' ? '抖音 / 小红书 / 视频号' : platform),
      summary: {
        coreThesis: `围绕「${shortTopic(topic)}」，采用「${idea.archetype}」切入，避免空洞说教，用看得见的画面证据和克制金句完成一次高留存传播。`,
        openingHook: idea.hook3s,
        creativePoints: [
          idea.creativeTwist,
          `结构化控速：全片口播约 ${totalChars} 字，严格贴合 ${totalSeconds} 秒真实拍摄呼吸感，拒绝念经式赶词。`,
          '高“非露脸特写”占比：用 45%–60% 的手部动作与细节空镜承担信息展示，大幅降低博主背稿 NG 焦虑。'
        ],
        storyLogicChain: [
          '01 奇观/反差开场：前 3 秒用强听觉物理声 + 反直觉提问锁住手指不划走',
          '02 场景定锚：快速建立可信身份与观察立场，让观众知道为什么该听你说',
          '03 证据推进：用具体道具/对照画面把抽象观点变成肉眼可见的“实证”',
          '04 判词收束：结尾用一句值得截图转发的短金句收尾，并留自然讨论切口'
        ],
        shareTriggers: [
          '低门槛可复制的实操细节（驱动收藏）',
          '反共识的犀利判断（驱动评论区站队与转发）',
          '克制高级的视觉影调（驱动主页关注）'
        ],
        titleOptions: [
          idea.title,
          `${totalSeconds}秒看透「${shortTopic(topic)}」：90%人都忽略的隐藏真相`,
          `关于「${shortTopic(topic)}」，这条不讨喜但值钱的实拍笔记建议收藏`
        ],
        coverConcept: `9:16 主视觉居中特写（浅景深虚化背景），大字主标题不超过 10 字置于视觉黄金分割线下方，右上角极细编号标签，禁止廉价描边花字。`
      },
      visualAesthetics: {
        lookAndFeel: idea.visualMood || domain.lookStyle,
        colorPalette: domain.palette,
        lightingPlan: '优先采用「单主光 + 压暗环境杂光」策略：室内关闭吸顶灯，仅用一盏 45° 侧顶柔光/窗边自然光打亮人物半侧脸与主体质感；室外尽量选下午 3:30–5:30 侧逆暖光。',
        cameraStyle: '主体镜头统一 35mm/50mm 焦段（手机可用 2x 长焦替代），减少无意义晃动；切镜干脆利落，关键结论处用极缓慢推进镜头增强情绪张力。',
        soundDesign: domain.soundStrategy,
        subtitleAndPackaging: '底部单行极简字幕（字号克制、无花哨描边），仅在关键数据/转折处配合极细 1px 线框标签；片尾保留 1 秒呼吸定格切品牌落版。'
      },
      storyboard: shots,
      productionPlan: {
        estimatedPrepTime: '30 分钟筹备 · 90 分钟现场拍摄 · 45 分钟粗精剪',
        estimatedBudget: idea.budgetTier || '低成本（100元以内）',
        locationSuggestion: domain.key === 'business'
          ? '免费公共街区/咖啡馆靠窗位 + 干净素色桌面一角（避开正午顶光）'
          : '自然光良好的室内靠窗桌面或生活真实场景（提前清理背景杂物）',
        equipmentAndProps: domain.props,
        shootingOrder: [
          {
            step: 1,
            group: '先拍 B组 · 主角露脸口播主机位',
            shotsIncluded: shots.filter((s) => s.sceneGroup.startsWith('B组')).map((s) => `镜#${s.shotNumber}`).join('、') || '主口播镜头',
            action: '一次性架好三脚架/灯光与领夹麦，趁状态最好连拍 2–3 条完整口播，语速保持松弛平稳，每句之间留半秒气口方便剪辑。'
          },
          {
            step: 2,
            group: '再拍 A组 · 核心细节/手部特写与俯拍',
            shotsIncluded: shots.filter((s) => s.sceneGroup.startsWith('A组')).map((s) => `镜#${s.shotNumber}`).join('、') || '特写镜头',
            action: '切至近距/俯拍机位，专门补齐手部拿放道具、微距特写与清晰物理同期声素材，每个动作多拍 2 秒起幅和落幅。'
          },
          {
            step: 3,
            group: '最后拍 C组 · 环境空镜与对比转场',
            shotsIncluded: shots.filter((s) => s.sceneGroup.startsWith('C组')).map((s) => `镜#${s.shotNumber}`).join('、') || '空镜素材',
            action: '补拍 3–5 条 5 秒以上环境氛围空镜（光影流动、人物背影/街景/空间全景），专门用来做 VO 画外音铺底和剪辑兜底。'
          }
        ],
        antiNgTips: [
          '不需要死记整篇长词：仅露脸镜头需要背 1–2 句短句，其余 VO 段落完全可以在拍完画面后对着手机从容录音。',
          '物理同期声单独录 10 秒“房间安静底噪”，后期用来平滑剪辑音频接缝，听感立刻像专业团队出品。',
          '拍完第一个镜头立即回看 5 秒检查：焦点是否锁在眼睛/主体上、领夹麦是否爆音、背景有无杂乱穿帮。'
        ],
        postProductionSteps: [
          '1. 声音先行粗剪（A-Roll）：先把所有口播和 VO 剪到呼吸流畅、删掉多余“嗯/啊”气口，锁定精准总时长。',
          '2. 铺叠特写与空镜（B-Roll）：把 45% 以上画面盖上高质感微距与场景切镜，做到每 3–5 秒至少有一次视觉景别变化。',
          '3. 物理音效与层次铺底：在转场和动作落点对齐清脆同期声，BGM 若使用则压低至 -26dB 以下不抢人声。',
          '4. 统一影调调色：套用统一胶片感 LUT，微调高光偏暖、阴影略冷偏炭黑，保证全片观感统一。',
          '5. 极简字幕与封面导出：校对断句（每行 ≤ 14 字），单独挑选最有故事感的一帧制作封面。'
        ]
      }
    };

    return {
      data: script,
      thoughtSummary: `已按 ${totalSeconds} 秒精准拆分 ${shots.length} 个分镜，合并了 3 个现场顺场拍摄组（避免来回拆灯），并校准口播总字数为 ${totalChars} 字。`,
      usage: { inputTokens: 1180, cachedTokens: 480, outputTokens: 2150, reasoningTokens: 1320, totalTokens: 4650 }
    };
  }

  if (stage === 'shootability_reviewer') {
    const script = context.script;
    const deterministic = auditScriptTimingAndWordcount(script);
    const data = {
      overallScore: deterministic.score,
      verdict: deterministic.score >= 88 ? '可直接进场开拍' : '建议微调后开拍',
      strengths: [
        '前 3 秒具备明确听觉与视觉双重钩子，避免传统自媒体缓慢铺垫导致的滑走。',
        '已按机位/场景合并现场实拍顺序表（Shooting Order），无需按剧情反复拆装灯光。',
        `分镜总时长（${deterministic.metrics.actualSeconds}s）与目标时长（${deterministic.metrics.targetSeconds}s）对齐良好。`
      ],
      risks: deterministic.issues.length
        ? deterministic.issues
        : ['实拍时注意保持前后镜头色温一致，避免室内暖灯与窗外日光混光导致肤色发灰。'],
      optimizationSuggestions: [
        '如果想测试更强流量爆发力，可点击下方「压缩成 30 秒高密版」生成切片对照组。',
        '若为单人首次出镜，可将第 2 镜口播改为侧面微距拿道具 + 画外音，进一步降低镜头压力。'
      ],
      metrics: deterministic.metrics
    };
    return {
      data,
      thoughtSummary: `导演审片工具校验完成：总分 ${data.overallScore}/100，平均语速 ${deterministic.metrics.charsPerSecond} 字/秒，分镜时间轴对齐误差 ${Math.abs(deterministic.metrics.durationDelta)} 秒。`,
      usage: { inputTokens: 920, cachedTokens: 520, outputTokens: 460, reasoningTokens: 410, totalTokens: 1790 }
    };
  }

  if (stage === 'script_refiner') {
    const base = structuredClone(context.script);
    const instruction = String(context.instruction || '').trim();
    const secMatch = instruction.match(/(\d{2,3})\s*(?:秒|s|S)/);
    let nextSeconds = base.targetSeconds || 45;
    if (secMatch) {
      nextSeconds = Math.max(15, Math.min(180, Number(secMatch[1])));
    } else if (/缩短|压缩|更短|切片/.test(instruction)) {
      nextSeconds = Math.max(15, Math.min(30, nextSeconds - 15));
    } else if (/拉长|扩写|更深|详细/.test(instruction)) {
      nextSeconds = Math.min(180, nextSeconds + 30);
    }

    const updatedIdea = {
      title: base.title,
      archetype: /反转|冲突|犀利/.test(instruction) ? '强冲突反转升级版' : '导演精修版',
      hook3s: /钩子|开头|前3秒|前 3 秒/.test(instruction)
        ? `“停一下！关于「${shortTopic(topic)}」，如果你还在用老办法，这 ${nextSeconds} 秒能帮你直接省掉一半弯路。”`
        : base.summary?.openingHook,
      visualMood: /暗调|黑金|电影/.test(instruction)
        ? '低饱和黑金暗调 · 单束聚光灯 + 极简浅景深电影感'
        : /手机|单人|低成本|极简/.test(instruction)
          ? '单人手机直出极简自然光 · 零布光负担 · 2x 人像长焦'
          : base.visualAesthetics?.lookAndFeel,
      budgetTier: /手机|低成本|零成本|单人/.test(instruction) ? '超低成本（0–30元，手机单人可拍）' : base.productionPlan?.estimatedBudget,
      creativeTwist: `已根据指令「${instruction}」定向重构节奏与实拍方案。`
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
    rebuilt.summary.creativePoints.unshift(`本次 Agent 精修重点：${instruction}`);

    return {
      data: rebuilt,
      thoughtSummary: `已根据精修指令「${instruction}」重新编排分镜与实拍方案（调整后时长 ${nextSeconds} 秒，共 ${rebuilt.storyboard.length} 镜）。`,
      usage: { inputTokens: 1320, cachedTokens: 600, outputTokens: 1980, reasoningTokens: 1100, totalTokens: 4400 }
    };
  }

  throw new Error(`未知的沙盒阶段: ${stage}`);
}
