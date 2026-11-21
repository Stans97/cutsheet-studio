import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

function safeParse(str, fallback = null) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Storage wrapper using Node 22.5+/24 built-in node:sqlite when available,
 * with seamless atomic JSON file fallback for older Node runtimes.
 */
export class StudioStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.mode = 'json';
    this.db = null;
    this.jsonPath = path.join(this.dataDir, 'studio-store.json');
    this.state = { guests: {}, projects: {}, scripts: {} };
  }

  async init() {
    try {
      const sqlite = await import('node:sqlite');
      const dbPath = path.join(this.dataDir, 'cutsheet.sqlite');
      this.db = new sqlite.DatabaseSync(dbPath);
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS guests (
          id TEXT PRIMARY KEY,
          nickname TEXT NOT NULL DEFAULT '游客创作者',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          guest_id TEXT NOT NULL,
          topic TEXT NOT NULL,
          platform TEXT NOT NULL DEFAULT 'auto',
          target_seconds INTEGER,
          brief_json TEXT,
          duration_plan_json TEXT,
          ideas_json TEXT,
          active_script_id TEXT,
          last_provider TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_projects_guest_updated
          ON projects (guest_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS scripts (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          guest_id TEXT NOT NULL,
          idea_id TEXT,
          title TEXT NOT NULL,
          provider TEXT,
          model TEXT,
          reasoning_level TEXT,
          script_json TEXT NOT NULL,
          audit_json TEXT,
          agent_trace_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_scripts_project
          ON scripts (project_id, updated_at DESC);
      `);
      this.mode = 'sqlite';
    } catch {
      this.mode = 'json';
      if (fs.existsSync(this.jsonPath)) {
        this.state = safeParse(fs.readFileSync(this.jsonPath, 'utf8'), {
          guests: {},
          projects: {},
          scripts: {}
        });
      } else {
        this._flushJson();
      }
    }
    return this;
  }

  _flushJson() {
    const tmp = `${this.jsonPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.jsonPath);
  }

  close() {
    if (this.db && typeof this.db.close === 'function') {
      this.db.close();
    }
  }

  ensureGuest(guestId) {
    const cleanId =
      typeof guestId === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(guestId)
        ? guestId
        : `gst_${crypto.randomBytes(12).toString('hex')}`;
    const ts = nowIso();

    if (this.mode === 'sqlite') {
      const existing = this.db.prepare('SELECT * FROM guests WHERE id = ?').get(cleanId);
      if (existing) return existing;
      this.db
        .prepare('INSERT INTO guests (id, nickname, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(cleanId, '游客创作者', ts, ts);
      return { id: cleanId, nickname: '游客创作者', created_at: ts, updated_at: ts };
    }

    if (!this.state.guests[cleanId]) {
      this.state.guests[cleanId] = {
        id: cleanId,
        nickname: '游客创作者',
        created_at: ts,
        updated_at: ts
      };
      this._flushJson();
    }
    return this.state.guests[cleanId];
  }

  updateGuestNickname(guestId, nickname) {
    const cleanName = String(nickname || '').trim().slice(0, 32) || '游客创作者';
    const ts = nowIso();
    this.ensureGuest(guestId);
    if (this.mode === 'sqlite') {
      this.db
        .prepare('UPDATE guests SET nickname = ?, updated_at = ? WHERE id = ?')
        .run(cleanName, ts, guestId);
      return this.db.prepare('SELECT * FROM guests WHERE id = ?').get(guestId);
    }
    this.state.guests[guestId].nickname = cleanName;
    this.state.guests[guestId].updated_at = ts;
    this._flushJson();
    return this.state.guests[guestId];
  }

  _hydrateProject(row) {
    if (!row) return null;
    return {
      id: row.id,
      guestId: row.guest_id,
      topic: row.topic,
      platform: row.platform,
      targetSeconds: row.target_seconds,
      brief: safeParse(row.brief_json, {}),
      durationPlan: safeParse(row.duration_plan_json, null),
      ideas: safeParse(row.ideas_json, []),
      activeScriptId: row.active_script_id || null,
      lastProvider: row.last_provider || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  _hydrateScript(row) {
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      guestId: row.guest_id,
      ideaId: row.idea_id || null,
      title: row.title,
      provider: row.provider,
      model: row.model,
      reasoningLevel: row.reasoning_level,
      script: safeParse(row.script_json, {}),
      audit: safeParse(row.audit_json, null),
      agentTrace: safeParse(row.agent_trace_json, []),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  listProjects(guestId, limit = 40) {
    if (this.mode === 'sqlite') {
      const rows = this.db
        .prepare(
          `SELECT p.*,
            (SELECT COUNT(*) FROM scripts s WHERE s.project_id = p.id AND s.guest_id = p.guest_id) AS script_count
           FROM projects p
           WHERE p.guest_id = ?
           ORDER BY p.updated_at DESC
           LIMIT ?`
        )
        .all(guestId, limit);
      return rows.map((r) => ({
        ...this._hydrateProject(r),
        scriptCount: Number(r.script_count || 0),
        ideaCount: safeParse(r.ideas_json, []).length
      }));
    }

    const projects = Object.values(this.state.projects)
      .filter((p) => p.guest_id === guestId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit);
    return projects.map((row) => {
      const scriptCount = Object.values(this.state.scripts).filter(
        (s) => s.project_id === row.id && s.guest_id === guestId
      ).length;
      const hydrated = this._hydrateProject(row);
      return {
        ...hydrated,
        scriptCount,
        ideaCount: hydrated.ideas.length
      };
    });
  }

  createProject(guestId, payload) {
    const id = `prj_${crypto.randomBytes(8).toString('hex')}`;
    const ts = nowIso();
    const row = {
      id,
      guest_id: guestId,
      topic: String(payload.topic || '').trim(),
      platform: String(payload.platform || 'auto'),
      target_seconds: payload.targetSeconds ? Number(payload.targetSeconds) : null,
      brief_json: JSON.stringify(payload.brief || {}),
      duration_plan_json: payload.durationPlan ? JSON.stringify(payload.durationPlan) : null,
      ideas_json: JSON.stringify(payload.ideas || []),
      active_script_id: payload.activeScriptId || null,
      last_provider: payload.lastProvider || null,
      created_at: ts,
      updated_at: ts
    };

    if (this.mode === 'sqlite') {
      this.db
        .prepare(
          `INSERT INTO projects (
            id, guest_id, topic, platform, target_seconds, brief_json,
            duration_plan_json, ideas_json, active_script_id, last_provider,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          row.id,
          row.guest_id,
          row.topic,
          row.platform,
          row.target_seconds,
          row.brief_json,
          row.duration_plan_json,
          row.ideas_json,
          row.active_script_id,
          row.last_provider,
          row.created_at,
          row.updated_at
        );
      return this._hydrateProject(row);
    }

    this.state.projects[id] = row;
    this._flushJson();
    return this._hydrateProject(row);
  }

  updateProject(guestId, projectId, patch) {
    const existing = this.getProject(guestId, projectId);
    if (!existing) return null;
    const ts = nowIso();
    const next = {
      topic: patch.topic !== undefined ? String(patch.topic) : existing.topic,
      platform: patch.platform !== undefined ? String(patch.platform) : existing.platform,
      target_seconds:
        patch.targetSeconds !== undefined
          ? patch.targetSeconds
            ? Number(patch.targetSeconds)
            : null
          : existing.targetSeconds,
      brief_json: JSON.stringify(patch.brief !== undefined ? patch.brief : existing.brief),
      duration_plan_json:
        patch.durationPlan !== undefined
          ? patch.durationPlan
            ? JSON.stringify(patch.durationPlan)
            : null
          : existing.durationPlan
            ? JSON.stringify(existing.durationPlan)
            : null,
      ideas_json: JSON.stringify(patch.ideas !== undefined ? patch.ideas : existing.ideas),
      active_script_id:
        patch.activeScriptId !== undefined ? patch.activeScriptId : existing.activeScriptId,
      last_provider:
        patch.lastProvider !== undefined ? patch.lastProvider : existing.lastProvider,
      updated_at: ts
    };

    if (this.mode === 'sqlite') {
      this.db
        .prepare(
          `UPDATE projects SET
            topic = ?, platform = ?, target_seconds = ?, brief_json = ?,
            duration_plan_json = ?, ideas_json = ?, active_script_id = ?,
            last_provider = ?, updated_at = ?
           WHERE id = ? AND guest_id = ?`
        )
        .run(
          next.topic,
          next.platform,
          next.target_seconds,
          next.brief_json,
          next.duration_plan_json,
          next.ideas_json,
          next.active_script_id,
          next.last_provider,
          next.updated_at,
          projectId,
          guestId
        );
      return this.getProject(guestId, projectId);
    }

    Object.assign(this.state.projects[projectId], next);
    this._flushJson();
    return this.getProject(guestId, projectId);
  }

  getProject(guestId, projectId) {
    if (this.mode === 'sqlite') {
      const row = this.db
        .prepare('SELECT * FROM projects WHERE id = ? AND guest_id = ?')
        .get(projectId, guestId);
      return this._hydrateProject(row);
    }
    const row = this.state.projects[projectId];
    if (!row || row.guest_id !== guestId) return null;
    return this._hydrateProject(row);
  }

  getProjectWithScripts(guestId, projectId) {
    const project = this.getProject(guestId, projectId);
    if (!project) return null;
    const scripts = this.listScriptsByProject(guestId, projectId);
    return { ...project, scripts };
  }

  deleteProject(guestId, projectId) {
    const existing = this.getProject(guestId, projectId);
    if (!existing) return false;
    if (this.mode === 'sqlite') {
      this.db.prepare('DELETE FROM scripts WHERE project_id = ? AND guest_id = ?').run(projectId, guestId);
      this.db.prepare('DELETE FROM projects WHERE id = ? AND guest_id = ?').run(projectId, guestId);
      return true;
    }
    delete this.state.projects[projectId];
    for (const [sid, s] of Object.entries(this.state.scripts)) {
      if (s.project_id === projectId && s.guest_id === guestId) {
        delete this.state.scripts[sid];
      }
    }
    this._flushJson();
    return true;
  }

  listScriptsByProject(guestId, projectId) {
    if (this.mode === 'sqlite') {
      const rows = this.db
        .prepare(
          'SELECT * FROM scripts WHERE project_id = ? AND guest_id = ? ORDER BY updated_at DESC'
        )
        .all(projectId, guestId);
      return rows.map((r) => this._hydrateScript(r));
    }
    return Object.values(this.state.scripts)
      .filter((s) => s.project_id === projectId && s.guest_id === guestId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((r) => this._hydrateScript(r));
  }

  saveScript(guestId, projectId, payload) {
    const ts = nowIso();
    const id = payload.id || `scr_${crypto.randomBytes(8).toString('hex')}`;
    const existing = this.getScript(guestId, id);

    const row = {
      id,
      project_id: projectId,
      guest_id: guestId,
      idea_id: payload.ideaId || existing?.ideaId || null,
      title: String(payload.title || payload.script?.title || '未命名拍摄脚本').trim(),
      provider: payload.provider || existing?.provider || 'sandbox',
      model: payload.model || existing?.model || 'sandbox-director-v1',
      reasoning_level: payload.reasoningLevel || existing?.reasoningLevel || 'high',
      script_json: JSON.stringify(payload.script || {}),
      audit_json: payload.audit ? JSON.stringify(payload.audit) : null,
      agent_trace_json: JSON.stringify(payload.agentTrace || []),
      created_at: existing?.createdAt || ts,
      updated_at: ts
    };

    if (this.mode === 'sqlite') {
      if (existing) {
        this.db
          .prepare(
            `UPDATE scripts SET
              idea_id = ?, title = ?, provider = ?, model = ?, reasoning_level = ?,
              script_json = ?, audit_json = ?, agent_trace_json = ?, updated_at = ?
             WHERE id = ? AND guest_id = ?`
          )
          .run(
            row.idea_id,
            row.title,
            row.provider,
            row.model,
            row.reasoning_level,
            row.script_json,
            row.audit_json,
            row.agent_trace_json,
            row.updated_at,
            id,
            guestId
          );
      } else {
        this.db
          .prepare(
            `INSERT INTO scripts (
              id, project_id, guest_id, idea_id, title, provider, model, reasoning_level,
              script_json, audit_json, agent_trace_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            row.id,
            row.project_id,
            row.guest_id,
            row.idea_id,
            row.title,
            row.provider,
            row.model,
            row.reasoning_level,
            row.script_json,
            row.audit_json,
            row.agent_trace_json,
            row.created_at,
            row.updated_at
          );
      }
    } else {
      this.state.scripts[id] = row;
      this._flushJson();
    }

    this.updateProject(guestId, projectId, {
      activeScriptId: id,
      lastProvider: row.provider
    });

    return this._hydrateScript(row);
  }

  getScript(guestId, scriptId) {
    if (this.mode === 'sqlite') {
      const row = this.db
        .prepare('SELECT * FROM scripts WHERE id = ? AND guest_id = ?')
        .get(scriptId, guestId);
      return this._hydrateScript(row);
    }
    const row = this.state.scripts[scriptId];
    if (!row || row.guest_id !== guestId) return null;
    return this._hydrateScript(row);
  }

  deleteScript(guestId, scriptId) {
    const existing = this.getScript(guestId, scriptId);
    if (!existing) return false;
    if (this.mode === 'sqlite') {
      this.db.prepare('DELETE FROM scripts WHERE id = ? AND guest_id = ?').run(scriptId, guestId);
      return true;
    }
    delete this.state.scripts[scriptId];
    this._flushJson();
    return true;
  }
}
