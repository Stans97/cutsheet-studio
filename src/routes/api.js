import {
  resolveGatewaySettings,
  testProviderGateway,
  getPublicProviderSummary
} from '../providers/index.js';
import {
  runDiscoveryPipeline,
  runMoreIdeas,
  runScriptExpansion,
  runScriptRefinement
} from '../agents/orchestrator.js';
import {
  reconcileStoryboardTimecodes,
  auditScriptTimingAndWordcount,
  exportScriptToMarkdown
} from '../agents/tools.js';

const GUEST_COOKIE = 'cutsheet_guest';

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function buildGuestCookie(guestId, req, cookiePath = '/') {
  const isHttps = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  const secureFlag = isHttps ? '; Secure' : '';
  return `${GUEST_COOKIE}=${encodeURIComponent(guestId)}; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=15552000${secureFlag}`;
}

function resolveGuest(req, res, store, cookiePath = '/') {
  const cookies = parseCookies(req.headers.cookie);
  const headerToken = String(req.headers['x-guest-token'] || '').trim();
  const rawId = headerToken || cookies[GUEST_COOKIE] || '';
  const guest = store.ensureGuest(rawId);

  if (cookies[GUEST_COOKIE] !== guest.id) {
    res.setHeader('Set-Cookie', buildGuestCookie(guest.id, req, cookiePath));
  }
  return guest;
}

async function readJsonBody(req, maxBytes = 1_500_000) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const err = new Error('请求体超出大小限制');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('请求体不是合法的 JSON');
    err.statusCode = 400;
    throw err;
  }
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function createSseHelper(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const controller = new AbortController();
  let closed = false;

  // Listen on response close (client disconnect), not req close which fires after POST body ends
  res.on('close', () => {
    if (!res.writableEnded) {
      closed = true;
      controller.abort();
    }
  });

  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 15_000);

  const emit = (event, data) => {
    if (closed || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const end = () => {
    clearInterval(heartbeat);
    if (!closed && !res.writableEnded) {
      res.end();
    }
  };

  return { emit, end, signal: controller.signal };
}

function wantsSse(req) {
  const accept = String(req.headers.accept || '');
  return accept.includes('text/event-stream');
}

export function createApiRouter(store, options = {}) {
  const cookiePath = options.cookiePath || '/';
  const getGuest = (req, res) => resolveGuest(req, res, store, cookiePath);

  return async function handleApiRequest(req, res, url) {
    const method = req.method || 'GET';
    const pathname = url.pathname;

    try {
      // ── Health Check ─────────────────────────────────────────
      if (method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, {
          ok: true,
          service: 'creator-script-studio',
          storage: store.mode,
          providers: getPublicProviderSummary(),
          timestamp: new Date().toISOString()
        });
      }

      // ── Guest Session (Zero-login) ───────────────────────────
      if (method === 'GET' && pathname === '/api/guest') {
        const guest = getGuest(req, res);
        return sendJson(res, 200, {
          guest,
          providers: getPublicProviderSummary()
        });
      }

      if (method === 'PATCH' && pathname === '/api/guest') {
        const body = await readJsonBody(req);
        // Optional workspace switch via guest token
        let guest;
        if (body.switchToken && /^[a-zA-Z0-9_-]{8,80}$/.test(String(body.switchToken).trim())) {
          guest = store.ensureGuest(String(body.switchToken).trim());
          res.setHeader('Set-Cookie', buildGuestCookie(guest.id, req, cookiePath));
        } else {
          guest = getGuest(req, res);
        }
        if (body.nickname !== undefined) {
          guest = store.updateGuestNickname(guest.id, body.nickname);
        }
        return sendJson(res, 200, { guest });
      }

      // ── Provider Gateway Connectivity Probe ──────────────────
      if (method === 'POST' && pathname === '/api/providers/test') {
        getGuest(req, res);
        const body = await readJsonBody(req);
        const providerId = String(body.provider || '').trim().toLowerCase();
        const result = await testProviderGateway(providerId, body.providerConfig || {}, req.headers);
        return sendJson(res, 200, result);
      }

      // ── Projects CRUD ────────────────────────────────────────
      if (method === 'GET' && pathname === '/api/projects') {
        const guest = getGuest(req, res);
        const projects = store.listProjects(guest.id);
        return sendJson(res, 200, { projects });
      }

      const projectMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)$/);
      if (projectMatch) {
        const guest = getGuest(req, res);
        const projectId = projectMatch[1];
        if (method === 'GET') {
          const project = store.getProjectWithScripts(guest.id, projectId);
          if (!project) return sendJson(res, 404, { error: '项目不存在或无访问权限' });
          return sendJson(res, 200, { project });
        }
        if (method === 'DELETE') {
          const ok = store.deleteProject(guest.id, projectId);
          if (!ok) return sendJson(res, 404, { error: '项目不存在' });
          return sendJson(res, 200, { ok: true });
        }
      }

      // ── Agent Stage 1 + 2 (+ optional 3 & 4): Discover ───────
      if (method === 'POST' && pathname === '/api/agent/discover') {
        const guest = getGuest(req, res);
        const body = await readJsonBody(req);
        const topic = String(body.topic || '').trim();
        if (!topic || topic.length < 2) {
          return sendJson(res, 400, { error: '请输入至少 2 个字的拍摄主题或灵感' });
        }

        const platform = String(body.platform || 'auto').trim();
        const lockedSeconds = body.lockedSeconds ? Number(body.lockedSeconds) : null;
        const persona = String(body.persona || '').trim();
        const resources = String(body.resources || '').trim();
        const ideaCount = Math.max(4, Math.min(8, Number(body.ideaCount) || 6));
        const autoExpandTopIdea = Boolean(body.autoExpandTopIdea);
        const gateway = resolveGatewaySettings(body.providerConfig || {}, req.headers);

        if (wantsSse(req)) {
          const sse = createSseHelper(req, res);
          try {
            const result = await runDiscoveryPipeline({
              topic,
              platform,
              lockedSeconds,
              persona,
              resources,
              ideaCount,
              autoExpandTopIdea,
              gateway,
              emit: sse.emit,
              signal: sse.signal
            });

            const project = store.createProject(guest.id, {
              topic,
              platform,
              targetSeconds: result.durationPlan.recommendedSeconds,
              brief: {
                persona,
                resources,
                lockedSeconds,
                creativeDirectionSummary: result.creativeDirectionSummary
              },
              durationPlan: result.durationPlan,
              ideas: result.ideas,
              lastProvider: result.trace[result.trace.length - 1]?.provider || 'sandbox'
            });

            let savedScript = null;
            if (result.expanded) {
              savedScript = store.saveScript(guest.id, project.id, {
                ideaId: result.ideas[0]?.id || null,
                title: result.expanded.script.title,
                provider: result.expanded.provider,
                model: result.expanded.model,
                reasoningLevel: result.expanded.reasoningLevel,
                script: result.expanded.script,
                audit: result.expanded.audit,
                agentTrace: result.trace
              });
            }

            const fullProject = store.getProjectWithScripts(guest.id, project.id);
            sse.emit('done', { project: fullProject, script: savedScript, trace: result.trace });
          } catch (err) {
            sse.emit('error', { error: err.message || 'Agent 执行失败' });
          } finally {
            sse.end();
          }
          return;
        }

        const result = await runDiscoveryPipeline({
          topic,
          platform,
          lockedSeconds,
          persona,
          resources,
          ideaCount,
          autoExpandTopIdea,
          gateway
        });

        const project = store.createProject(guest.id, {
          topic,
          platform,
          targetSeconds: result.durationPlan.recommendedSeconds,
          brief: {
            persona,
            resources,
            lockedSeconds,
            creativeDirectionSummary: result.creativeDirectionSummary
          },
          durationPlan: result.durationPlan,
          ideas: result.ideas,
          lastProvider: result.trace[result.trace.length - 1]?.provider || 'sandbox'
        });

        let savedScript = null;
        if (result.expanded) {
          savedScript = store.saveScript(guest.id, project.id, {
            ideaId: result.ideas[0]?.id || null,
            title: result.expanded.script.title,
            provider: result.expanded.provider,
            model: result.expanded.model,
            reasoningLevel: result.expanded.reasoningLevel,
            script: result.expanded.script,
            audit: result.expanded.audit,
            agentTrace: result.trace
          });
        }

        return sendJson(res, 200, {
          project: store.getProjectWithScripts(guest.id, project.id),
          script: savedScript,
          trace: result.trace
        });
      }

      // ── Append More Distinct Ideas ───────────────────────────
      const moreIdeasMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/more-ideas$/);
      if (method === 'POST' && moreIdeasMatch) {
        const guest = getGuest(req, res);
        const project = store.getProject(guest.id, moreIdeasMatch[1]);
        if (!project) return sendJson(res, 404, { error: '项目不存在' });

        const body = await readJsonBody(req);
        const count = Math.max(2, Math.min(6, Number(body.count) || 4));
        const gateway = resolveGatewaySettings(body.providerConfig || {}, req.headers);

        if (wantsSse(req)) {
          const sse = createSseHelper(req, res);
          try {
            const { newIdeas, trace } = await runMoreIdeas({
              project,
              count,
              gateway,
              emit: sse.emit,
              signal: sse.signal
            });
            const merged = [...(project.ideas || []), ...newIdeas];
            store.updateProject(guest.id, project.id, { ideas: merged });
            sse.emit('done', {
              project: store.getProjectWithScripts(guest.id, project.id),
              newIdeas,
              trace
            });
          } catch (err) {
            sse.emit('error', { error: err.message || '追加发散失败' });
          } finally {
            sse.end();
          }
          return;
        }

        const { newIdeas, trace } = await runMoreIdeas({ project, count, gateway });
        const merged = [...(project.ideas || []), ...newIdeas];
        store.updateProject(guest.id, project.id, { ideas: merged });
        return sendJson(res, 200, {
          project: store.getProjectWithScripts(guest.id, project.id),
          newIdeas,
          trace
        });
      }

      // ── Expand Specific Idea -> Complete Shooting Script ─────
      const expandMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/expand$/);
      if (method === 'POST' && expandMatch) {
        const guest = getGuest(req, res);
        const project = store.getProject(guest.id, expandMatch[1]);
        if (!project) return sendJson(res, 404, { error: '项目不存在' });

        const body = await readJsonBody(req);
        const idea =
          body.idea ||
          (project.ideas || []).find((i) => i.id === body.ideaId) ||
          (project.ideas || [])[0];
        if (!idea) {
          return sendJson(res, 400, { error: '请选择一个有效的创意方向后再展开脚本' });
        }

        const overrideSeconds = body.overrideSeconds ? Number(body.overrideSeconds) : null;
        const gateway = resolveGatewaySettings(body.providerConfig || {}, req.headers);

        if (wantsSse(req)) {
          const sse = createSseHelper(req, res);
          try {
            const expanded = await runScriptExpansion({
              topic: project.topic,
              platform: project.platform,
              persona: project.brief?.persona || '',
              resources: project.brief?.resources || '',
              durationPlan: project.durationPlan,
              idea,
              overrideSeconds,
              gateway,
              emit: sse.emit,
              signal: sse.signal
            });

            const savedScript = store.saveScript(guest.id, project.id, {
              ideaId: idea.id || null,
              title: expanded.script.title,
              provider: expanded.provider,
              model: expanded.model,
              reasoningLevel: expanded.reasoningLevel,
              script: expanded.script,
              audit: expanded.audit,
              agentTrace: expanded.trace
            });

            sse.emit('done', {
              project: store.getProjectWithScripts(guest.id, project.id),
              script: savedScript,
              trace: expanded.trace
            });
          } catch (err) {
            sse.emit('error', { error: err.message || '脚本展开失败' });
          } finally {
            sse.end();
          }
          return;
        }

        const expanded = await runScriptExpansion({
          topic: project.topic,
          platform: project.platform,
          persona: project.brief?.persona || '',
          resources: project.brief?.resources || '',
          durationPlan: project.durationPlan,
          idea,
          overrideSeconds,
          gateway
        });

        const savedScript = store.saveScript(guest.id, project.id, {
          ideaId: idea.id || null,
          title: expanded.script.title,
          provider: expanded.provider,
          model: expanded.model,
          reasoningLevel: expanded.reasoningLevel,
          script: expanded.script,
          audit: expanded.audit,
          agentTrace: expanded.trace
        });

        return sendJson(res, 200, {
          project: store.getProjectWithScripts(guest.id, project.id),
          script: savedScript,
          trace: expanded.trace
        });
      }

      // ── Script Refine / Fork with Alternate Model ────────────
      const refineMatch = pathname.match(/^\/api\/scripts\/([a-zA-Z0-9_-]+)\/refine$/);
      if (method === 'POST' && refineMatch) {
        const guest = getGuest(req, res);
        const existing = store.getScript(guest.id, refineMatch[1]);
        if (!existing) return sendJson(res, 404, { error: '脚本不存在' });
        const project = store.getProject(guest.id, existing.projectId);
        if (!project) return sendJson(res, 404, { error: '所属项目不存在' });

        const body = await readJsonBody(req);
        const instruction = String(body.instruction || '').trim();
        if (!instruction) return sendJson(res, 400, { error: '请输入具体的精修指令' });

        const saveAsNew = body.saveAsNew !== false;
        const overrideSeconds = body.overrideSeconds ? Number(body.overrideSeconds) : null;
        const gateway = resolveGatewaySettings(body.providerConfig || {}, req.headers);

        if (wantsSse(req)) {
          const sse = createSseHelper(req, res);
          try {
            const refined = await runScriptRefinement({
              topic: project.topic,
              platform: project.platform,
              currentScript: existing.script,
              instruction,
              overrideSeconds,
              gateway,
              emit: sse.emit,
              signal: sse.signal
            });

            const savedScript = store.saveScript(guest.id, project.id, {
              id: saveAsNew ? undefined : existing.id,
              ideaId: existing.ideaId,
              title: refined.script.title,
              provider: refined.provider,
              model: refined.model,
              reasoningLevel: refined.reasoningLevel,
              script: refined.script,
              audit: refined.audit,
              agentTrace: refined.trace
            });

            sse.emit('done', {
              project: store.getProjectWithScripts(guest.id, project.id),
              script: savedScript,
              trace: refined.trace
            });
          } catch (err) {
            sse.emit('error', { error: err.message || '脚本精修失败' });
          } finally {
            sse.end();
          }
          return;
        }

        const refined = await runScriptRefinement({
          topic: project.topic,
          platform: project.platform,
          currentScript: existing.script,
          instruction,
          overrideSeconds,
          gateway
        });

        const savedScript = store.saveScript(guest.id, project.id, {
          id: saveAsNew ? undefined : existing.id,
          ideaId: existing.ideaId,
          title: refined.script.title,
          provider: refined.provider,
          model: refined.model,
          reasoningLevel: refined.reasoningLevel,
          script: refined.script,
          audit: refined.audit,
          agentTrace: refined.trace
        });

        return sendJson(res, 200, {
          project: store.getProjectWithScripts(guest.id, project.id),
          script: savedScript,
          trace: refined.trace
        });
      }

      // ── Inline Shot Update ───────────────────────────────────
      const shotMatch = pathname.match(/^\/api\/scripts\/([a-zA-Z0-9_-]+)\/shot$/);
      if (method === 'PATCH' && shotMatch) {
        const guest = getGuest(req, res);
        const existing = store.getScript(guest.id, shotMatch[1]);
        if (!existing) return sendJson(res, 404, { error: '脚本不存在' });

        const body = await readJsonBody(req);
        const shotIndex = Number(body.shotIndex);
        const patch = body.patch || {};
        const script = structuredClone(existing.script);
        if (!Array.isArray(script.storyboard) || shotIndex < 0 || shotIndex >= script.storyboard.length) {
          return sendJson(res, 400, { error: '镜头编号无效' });
        }

        const allowedFields = [
          'phase',
          'seconds',
          'shotSize',
          'cameraMove',
          'sceneGroup',
          'visualAction',
          'dialogueType',
          'dialogue',
          'soundDesign',
          'postTip'
        ];
        for (const field of allowedFields) {
          if (patch[field] !== undefined) {
            script.storyboard[shotIndex][field] =
              field === 'seconds'
                ? Math.max(2, Math.min(60, Math.round(Number(patch[field]) || 5)))
                : String(patch[field]);
          }
        }

        const sumSec = script.storyboard.reduce((a, s) => a + Number(s.seconds || 0), 0);
        script.targetSeconds = sumSec;
        script.storyboard = reconcileStoryboardTimecodes(script.storyboard, sumSec);

        const nextAudit = {
          ...(existing.audit || {}),
          ...auditScriptTimingAndWordcount(script)
        };
        const updated = store.saveScript(guest.id, existing.projectId, {
          id: existing.id,
          ideaId: existing.ideaId,
          title: script.title,
          provider: existing.provider,
          model: existing.model,
          reasoningLevel: existing.reasoningLevel,
          script,
          audit: nextAudit,
          agentTrace: existing.agentTrace
        });
        return sendJson(res, 200, { script: updated });
      }

      // ── Export Script (.md / .json) ──────────────────────────
      const exportMatch = pathname.match(/^\/api\/scripts\/([a-zA-Z0-9_-]+)\/export$/);
      if (method === 'GET' && exportMatch) {
        const guest = getGuest(req, res);
        const scriptRecord = store.getScript(guest.id, exportMatch[1]);
        if (!scriptRecord) return sendJson(res, 404, { error: '脚本不存在' });
        const project = store.getProject(guest.id, scriptRecord.projectId);
        const format = (url.searchParams.get('format') || 'md').toLowerCase();
        const safeName = encodeURIComponent(
          (scriptRecord.title || 'cutsheet-script').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)
        );

        if (format === 'json') {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename*=UTF-8''${safeName}.json`
          });
          return res.end(JSON.stringify({ project: { id: project?.id, topic: project?.topic }, scriptRecord }, null, 2));
        }

        const markdown = exportScriptToMarkdown({ project, scriptRecord });
        res.writeHead(200, {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename*=UTF-8''${safeName}.md`
        });
        return res.end(markdown);
      }

      // ── Delete Script ────────────────────────────────────────
      const scriptMatch = pathname.match(/^\/api\/scripts\/([a-zA-Z0-9_-]+)$/);
      if (method === 'DELETE' && scriptMatch) {
        const guest = getGuest(req, res);
        const ok = store.deleteScript(guest.id, scriptMatch[1]);
        if (!ok) return sendJson(res, 404, { error: '脚本不存在' });
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 404, { error: `接口不存在: ${method} ${pathname}` });
    } catch (err) {
      const code = Number(err.statusCode) || 500;
      return sendJson(res, code, { error: err.message || '服务器内部错误' });
    }
  };
}
