import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStudioServer } from '../server.js';

async function startTempServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutsheet-test-'));
  const { server, store } = await createStudioServer({ dataDir: tmpDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    baseUrl,
    cleanup: () =>
      new Promise((resolve) => {
        server.close(() => {
          store.close();
          fs.rmSync(tmpDir, { recursive: true, force: true });
          resolve();
        });
      })
  };
}

test('End-to-end Guest Session, SSE Discovery, More Ideas, Expand, Refine, Shot Edit, and Export', async () => {
  const { baseUrl, cleanup } = await startTempServer();
  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.ok, true);
    assert.equal(health.providers.openai.defaultModel, 'gpt-6.2-sol');
    assert.equal(health.providers.openai.defaultEffort, 'high');
    assert.equal(health.providers.google.defaultModel, 'gemini-4-neon');
    assert.equal(health.providers.google.defaultEffort, 'high');

    // 2. Guest zero-login session cookie
    const guestRes = await fetch(`${baseUrl}/api/guest`);
    assert.equal(guestRes.status, 200);
    const cookieHeader = guestRes.headers.get('set-cookie');
    assert.ok(cookieHeader && cookieHeader.includes('cutsheet_guest='));
    const guestCookie = cookieHeader.split(';')[0];

    // 3. SSE Discovery (Stage 1 + 2 + 3 + 4 in sandbox mode)
    const sseRes = await fetch(`${baseUrl}/api/agent/discover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Cookie: guestCookie
      },
      body: JSON.stringify({
        topic: '上海安福路松弛感背后的商业流量账本',
        platform: '抖音',
        ideaCount: 6,
        autoExpandTopIdea: true,
        providerConfig: { mode: 'sandbox' }
      })
    });
    assert.equal(sseRes.status, 200);
    assert.match(sseRes.headers.get('content-type') || '', /text\/event-stream/);
    const sseText = await sseRes.text();

    const events = [];
    for (const block of sseText.split('\n\n')) {
      const evLine = block.split('\n').find((l) => l.startsWith('event:'));
      const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
      if (evLine && dataLine) {
        events.push({ event: evLine.slice(6).trim(), data: JSON.parse(dataLine.slice(5).trim()) });
      }
    }

    assert.ok(events.some((e) => e.event === 'agent_tool'));
    assert.ok(events.some((e) => e.event === 'duration_plan'));
    assert.ok(events.some((e) => e.event === 'ideas_ready'));
    assert.ok(events.some((e) => e.event === 'script_draft'));
    assert.ok(events.some((e) => e.event === 'audit_ready'));
    const doneEvent = events.find((e) => e.event === 'done');
    assert.ok(doneEvent);

    const project = doneEvent.data.project;
    const script = doneEvent.data.script;
    assert.equal(project.ideas.length, 6);
    assert.ok(script.script.storyboard.length >= 3);
    assert.ok(script.audit.overallScore >= 75);

    // 4. Guest isolation check: another guest cannot see this project
    const otherGuestRes = await fetch(`${baseUrl}/api/projects/${project.id}`);
    assert.equal(otherGuestRes.status, 404);

    // 5. Append more distinct ideas
    const moreRes = await fetch(`${baseUrl}/api/projects/${project.id}/more-ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: guestCookie },
      body: JSON.stringify({ count: 4, providerConfig: { mode: 'sandbox' } })
    });
    assert.equal(moreRes.status, 200);
    const moreData = await moreRes.json();
    assert.equal(moreData.project.ideas.length, 10);

    // 6. Expand second idea
    const expandRes = await fetch(`${baseUrl}/api/projects/${project.id}/expand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: guestCookie },
      body: JSON.stringify({
        ideaId: project.ideas[1].id,
        overrideSeconds: 30,
        providerConfig: { mode: 'sandbox' }
      })
    });
    assert.equal(expandRes.status, 200);
    const expandData = await expandRes.json();
    assert.equal(expandData.script.script.targetSeconds, 30);
    assert.equal(expandData.project.scripts.length, 2);

    // 7. Refine script
    const refineRes = await fetch(`${baseUrl}/api/scripts/${script.id}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: guestCookie },
      body: JSON.stringify({
        instruction: '压缩成 30 秒极速高密版',
        providerConfig: { mode: 'sandbox' }
      })
    });
    assert.equal(refineRes.status, 200);
    const refineData = await refineRes.json();
    assert.equal(refineData.script.script.targetSeconds, 30);

    // 8. Inline shot edit recalculates timecodes
    const patchRes = await fetch(`${baseUrl}/api/scripts/${script.id}/shot`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: guestCookie },
      body: JSON.stringify({
        shotIndex: 0,
        patch: { seconds: 7, dialogue: '测试修改后的开场第一句台词。' }
      })
    });
    assert.equal(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.equal(patchData.script.script.storyboard[0].seconds, 7);
    assert.equal(patchData.script.script.storyboard[0].timecode, '00:00–00:07');

    // 9. Export Markdown
    const expRes = await fetch(`${baseUrl}/api/scripts/${script.id}/export?format=md`, {
      headers: { Cookie: guestCookie }
    });
    assert.equal(expRes.status, 200);
    const mdText = await expRes.text();
    assert.match(mdText, /逐镜分镜脚本表/);

    // 10. Explicit forced provider without key gives clear error (never silently fakes)
    const noKeyRes = await fetch(`${baseUrl}/api/agent/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: guestCookie },
      body: JSON.stringify({
        topic: '测试 OpenAI 强制校验',
        providerConfig: { mode: 'openai' }
      })
    });
    assert.equal(noKeyRes.status, 500);
    const noKeyBody = await noKeyRes.json();
    assert.match(noKeyBody.error, /OpenAI API Key/);
  } finally {
    await cleanup();
  }
});

test('Subpath deployment (/cutsheet) and HTTPS proxy Secure cookie work cleanly', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutsheet-subpath-'));
  const { server, store } = await createStudioServer({
    dataDir: tmpDir,
    basePath: '/cutsheet',
    cookiePath: '/cutsheet/'
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    // Missing trailing slash redirects to /cutsheet/
    const redir = await fetch(`${baseUrl}/cutsheet`, { redirect: 'manual' });
    assert.equal(redir.status, 301);
    assert.equal(redir.headers.get('location'), '/cutsheet/');

    // Subpath API + HTTPS proxy header sets Path=/cutsheet/ and Secure flag
    const gRes = await fetch(`${baseUrl}/cutsheet/api/guest`, {
      headers: { 'X-Forwarded-Proto': 'https' }
    });
    assert.equal(gRes.status, 200);
    const setCookie = gRes.headers.get('set-cookie') || '';
    assert.match(setCookie, /Path=\/cutsheet\//);
    assert.match(setCookie, /Secure/);

    // Subpath static asset serves cleanly
    const htmlRes = await fetch(`${baseUrl}/cutsheet/`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.match(html, /\.\/css\/studio\.css/);
    assert.match(html, /\.\/js\/app\.js/);
  } finally {
    await new Promise((resolve) => {
      server.close(() => {
        store.close();
        fs.rmSync(tmpDir, { recursive: true, force: true });
        resolve();
      });
    });
  }
});
