import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateDurationAndPacing,
  calculateSpeechBudget,
  reconcileStoryboardTimecodes,
  auditScriptTimingAndWordcount,
  exportScriptToMarkdown
} from '../src/agents/tools.js';

test('estimateDurationAndPacing maps short punchy topics shorter than deep tutorial/Bilibili topics', () => {
  const quickDouyin = estimateDurationAndPacing({
    topic: '30秒一句话看懂咖啡定价心理学',
    platform: '抖音'
  });
  const deepBili = estimateDurationAndPacing({
    topic: '24小时全流程深度改造30平米老破小出租屋完整实测复盘',
    platform: 'B站'
  });

  assert.ok(quickDouyin.recommendedSeconds <= 45, `expected <=45s, got ${quickDouyin.recommendedSeconds}`);
  assert.ok(deepBili.recommendedSeconds >= 90, `expected >=90s, got ${deepBili.recommendedSeconds}`);
  assert.equal(quickDouyin.alternatives.length, 2);
  assert.ok(quickDouyin.pacingCurve.length >= 3);
});

test('estimateDurationAndPacing honors explicit lockedSeconds', () => {
  const locked = estimateDurationAndPacing({
    topic: '任意主题',
    platform: '小红书',
    lockedSeconds: 60
  });
  assert.equal(locked.recommendedSeconds, 60);
  const budget = calculateSpeechBudget(60);
  assert.ok(budget.ideal >= 170 && budget.ideal <= 240);
});

test('reconcileStoryboardTimecodes and auditScriptTimingAndWordcount verify timing and speech speed', () => {
  const shots = reconcileStoryboardTimecodes(
    [
      { phase: '钩子', seconds: 6, dialogueType: 'VO 画外音', dialogue: '周二下午两点，安福路喝冰美式的人比写字楼还密。' },
      { phase: '反转', seconds: 12, dialogueType: '真人口播', dialogue: '在商业尽调眼里，这八百米根本不是咖啡街，而是一座零片酬露天摄影棚。' },
      { phase: '收尾', seconds: 10, dialogueType: '真人口播', dialogue: '一座城市最紧绷的地方，连松弛感都要按平方厘米计价。' }
    ],
    30
  );

  assert.equal(shots.reduce((a, s) => a + s.seconds, 0), 30);
  assert.equal(shots[0].timecode, '00:00–00:06');
  assert.equal(shots[2].timecode, '00:18–00:30');

  const audit = auditScriptTimingAndWordcount({
    targetSeconds: 30,
    storyboard: shots,
    productionPlan: { shootingOrder: [{ step: 1, group: 'A组' }] }
  });
  assert.equal(audit.metrics.actualSeconds, 30);
  assert.ok(audit.score >= 85);

  const md = exportScriptToMarkdown({
    project: { topic: '安福路商业观察' },
    scriptRecord: {
      provider: 'openai',
      model: 'gpt-6.2-sol',
      reasoningLevel: 'high',
      script: {
        title: '安福路尽调',
        targetSeconds: 30,
        storyboard: shots,
        summary: { openingHook: '周二下午两点' },
        visualAesthetics: { lookAndFeel: '35mm 胶片', colorPalette: ['#181715', '#be3d27'] },
        productionPlan: { shootingOrder: [{ step: 1, group: '先拍主机位', shotsIncluded: '镜#2', action: '稳拍' }] }
      },
      audit: { overallScore: audit.score, verdict: '可直接开拍', metrics: audit.metrics }
    }
  });
  assert.match(md, /逐镜分镜脚本表/);
  assert.match(md, /gpt-6\.2-sol/);
  assert.match(md, /00:00–00:06/);
});
