import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type DesktopMission = {
  id: string;
  moduleId: string;
  title: string;
  objective: string;
  description: string;
  position: number;
  tasks: Array<Record<string, unknown> & { id: string }>;
};

export type DesktopModule = {
  id: string;
  title: string;
  description: string;
  position: number;
  missions: DesktopMission[];
};

export type DesktopProvision = {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  backendUrl: string;
  remoteToken: string;
  syncToken: string;
  expiresAt: string;
  modules: DesktopModule[];
  versions: Record<string, string>;
};

export type PendingMission = {
  operationId: string;
  provisionId: string;
  missionId: string;
  snapshotHash: string;
  answers: Array<{ taskId: string; answer: unknown }>;
  state: 'pending' | 'syncing' | 'synced' | 'conflict' | 'needs_auth' | 'error';
  attempts: number;
  createdAt: string;
  lastError: string | null;
  result: Record<string, unknown> | null;
};

export type DesktopSyncPreferences = {
  automatic: boolean;
  intervalSeconds: number;
  paused: boolean;
};

export type DesktopSyncSummary = {
  counts: { synced: number; pending: number; syncing: number; failed: number; conflicts: number; needsAuth: number };
  lastCompletedAt: string | null;
  activeRun: { id: string; total: number; confirmed: number; startedAt: string } | null;
  latestRun: { id: string; total: number; confirmed: number; state: string; startedAt: string; completedAt: string | null } | null;
  history: Array<{ occurredAt: string; operationType: string; result: string; attempts: number; error: string | null }>;
};

let database: DatabaseSync | null = null;

function dataKey() {
  const value = process.env.METALAB_DESKTOP_DATA_KEY || '';
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error('DESKTOP_DATA_KEY_UNAVAILABLE');
  return Buffer.from(value, 'hex');
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

function decrypt(value: Uint8Array) {
  const bytes = Buffer.from(value);
  if (bytes.length < 28) throw new Error('DESKTOP_ENCRYPTED_PAYLOAD_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', dataKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

export function withDesktopTransaction<T>(work: (db: DatabaseSync) => T): T {
  const db = getDesktopDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = work(db);
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function getDesktopDatabase() {
  if (process.env.METALAB_DESKTOP_MODE !== '1') throw new Error('DESKTOP_MODE_REQUIRED');
  if (database) return database;
  const filename = process.env.METALAB_DESKTOP_DB_PATH || '';
  if (!filename) throw new Error('DESKTOP_DB_PATH_REQUIRED');
  mkdirSync(dirname(filename), { recursive: true });
  database = new DatabaseSync(filename, { enableForeignKeyConstraints: true, timeout: 5000 });
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS desktop_schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS desktop_provisions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      student_name_enc BLOB NOT NULL,
      class_id TEXT NOT NULL,
      backend_url TEXT NOT NULL,
      remote_token_enc BLOB NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS desktop_provisions_student_idx
      ON desktop_provisions(student_id, expires_at DESC);
    CREATE TABLE IF NOT EXISTS desktop_mission_snapshots (
      provision_id TEXT NOT NULL REFERENCES desktop_provisions(id) ON DELETE CASCADE,
      mission_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      module_payload_enc BLOB NOT NULL,
      mission_payload_enc BLOB NOT NULL,
      snapshot_hash TEXT NOT NULL,
      cached_at TEXT NOT NULL,
      PRIMARY KEY(provision_id, mission_id)
    );
    CREATE INDEX IF NOT EXISTS desktop_snapshot_mission_idx
      ON desktop_mission_snapshots(provision_id, module_id);
    CREATE TABLE IF NOT EXISTS desktop_mission_outbox (
      operation_id TEXT PRIMARY KEY,
      provision_id TEXT NOT NULL REFERENCES desktop_provisions(id) ON DELETE RESTRICT,
      mission_id TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      answers_enc BLOB NOT NULL,
      payload_hash TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('pending','syncing','synced','conflict','needs_auth','error')),
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      last_error TEXT,
      result_enc BLOB,
      UNIQUE(provision_id, mission_id)
    );
    CREATE INDEX IF NOT EXISTS desktop_outbox_pending_idx
      ON desktop_mission_outbox(state, created_at);
    CREATE TABLE IF NOT EXISTS desktop_secrets (
      key TEXT PRIMARY KEY,
      value_enc BLOB NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO desktop_schema_migrations(version, applied_at)
      VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  `);
  // Local-only schema upgrades keep existing encrypted mission data intact.
  const outboxColumns = new Set((database.prepare('PRAGMA table_info(desktop_mission_outbox)').all() as Array<{ name: string }>).map(row => row.name));
  if (!outboxColumns.has('next_attempt_at')) database.exec('ALTER TABLE desktop_mission_outbox ADD COLUMN next_attempt_at TEXT');
  database.exec(`
    CREATE TABLE IF NOT EXISTS desktop_sync_preferences (
      provision_id TEXT PRIMARY KEY REFERENCES desktop_provisions(id) ON DELETE CASCADE,
      automatic INTEGER NOT NULL DEFAULT 1 CHECK(automatic IN (0,1)),
      interval_seconds INTEGER NOT NULL DEFAULT 60 CHECK(interval_seconds BETWEEN 30 AND 300),
      paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS desktop_sync_runs (
      id TEXT PRIMARY KEY,
      provision_id TEXT NOT NULL REFERENCES desktop_provisions(id) ON DELETE CASCADE,
      total INTEGER NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL CHECK(state IN ('running','completed','partial','failed')),
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS desktop_sync_runs_provision_idx ON desktop_sync_runs(provision_id, started_at DESC);
    CREATE TABLE IF NOT EXISTS desktop_sync_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provision_id TEXT NOT NULL REFERENCES desktop_provisions(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      result TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      error_code TEXT
    );
    CREATE INDEX IF NOT EXISTS desktop_sync_history_provision_idx ON desktop_sync_history(provision_id, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS desktop_sync_locks (
      provision_id TEXT PRIMARY KEY REFERENCES desktop_provisions(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO desktop_schema_migrations(version, applied_at)
      VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  `);
  // A crashed process leaves an expiring lease; a second live process must not reset its active work.
  const now = new Date().toISOString();
  database.prepare('DELETE FROM desktop_sync_locks WHERE expires_at<=?').run(now);
  database.prepare(`INSERT INTO desktop_sync_history(provision_id,operation_id,occurred_at,result,attempts,error_code)
    SELECT provision_id,operation_id,?,'error',attempts,'process_interrupted' FROM desktop_mission_outbox
    WHERE state='syncing' AND provision_id NOT IN (SELECT provision_id FROM desktop_sync_locks WHERE expires_at>?)`).run(now, now);
  database.prepare(`UPDATE desktop_mission_outbox SET state='pending' WHERE state='syncing'
    AND provision_id NOT IN (SELECT provision_id FROM desktop_sync_locks WHERE expires_at>?)`).run(now);
  database.prepare(`UPDATE desktop_sync_runs SET state='partial',completed_at=? WHERE state='running'
    AND provision_id NOT IN (SELECT provision_id FROM desktop_sync_locks WHERE expires_at>?)`).run(now, now);
  return database;
}

export function saveProvision(input: DesktopProvision) {
  const now = new Date().toISOString();
  const db = getDesktopDatabase();
  withDesktopTransaction(() => {
    db.prepare(`INSERT INTO desktop_provisions
      (id,student_id,student_name_enc,class_id,backend_url,remote_token_enc,expires_at,created_at)
      VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET student_name_enc=excluded.student_name_enc,
        backend_url=excluded.backend_url,remote_token_enc=excluded.remote_token_enc,
        expires_at=excluded.expires_at`).run(
      input.id, input.studentId, encrypt(input.studentName), input.classId,
      input.backendUrl, encrypt(JSON.stringify({ remoteToken: input.remoteToken, syncToken: input.syncToken })), input.expiresAt, now
    );
    const modulePayloads = new Map(input.modules.map(module => [module.id, module]));
    for (const module of input.modules) {
      for (const mission of module.missions) {
        const snapshotHash = input.versions[mission.id];
        if (!snapshotHash) throw new Error('DESKTOP_MISSION_VERSION_MISSING');
        db.prepare(`INSERT INTO desktop_mission_snapshots
          (provision_id,mission_id,module_id,module_payload_enc,mission_payload_enc,snapshot_hash,cached_at)
          VALUES(?,?,?,?,?,?,?) ON CONFLICT(provision_id,mission_id) DO UPDATE SET
            module_payload_enc=excluded.module_payload_enc,mission_payload_enc=excluded.mission_payload_enc,
            snapshot_hash=excluded.snapshot_hash,cached_at=excluded.cached_at`).run(
          input.id, mission.id, module.id, encrypt(JSON.stringify(modulePayloads.get(module.id))),
          encrypt(JSON.stringify(mission)), snapshotHash, now
        );
      }
    }
    db.prepare(`INSERT INTO desktop_secrets(key,value_enc,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET value_enc=excluded.value_enc,updated_at=excluded.updated_at`)
      .run(`backend:${input.studentId}`, encrypt(input.backendUrl), now);
  });
}

export function getDesktopSecretValue(key: string) {
  const row = getDesktopDatabase().prepare(`SELECT value_enc FROM desktop_secrets WHERE key=?`).get(key) as { value_enc: Uint8Array } | undefined;
  return row ? decrypt(row.value_enc) : null;
}

export function saveDesktopSecretValue(key: string, value: string) {
  const now = new Date().toISOString();
  getDesktopDatabase().prepare(`INSERT INTO desktop_secrets(key,value_enc,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value_enc=excluded.value_enc,updated_at=excluded.updated_at`)
    .run(key, encrypt(value), now);
}

export function getProvision(id: string) {
  const row = getDesktopDatabase().prepare(`SELECT * FROM desktop_provisions WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const encryptedTokens = JSON.parse(decrypt(row.remote_token_enc as Uint8Array)) as { remoteToken: string; syncToken: string };
  return {
    id: String(row.id), studentId: String(row.student_id), studentName: decrypt(row.student_name_enc as Uint8Array),
    classId: String(row.class_id), backendUrl: String(row.backend_url),
    remoteToken: encryptedTokens.remoteToken, syncToken: encryptedTokens.syncToken, expiresAt: String(row.expires_at)
  };
}

export function getProvisionWithPendingAnswers(studentId: string) {
  const row = getDesktopDatabase().prepare(`
    SELECT provision.id FROM desktop_provisions provision
    WHERE provision.student_id=? AND EXISTS (
      SELECT 1 FROM desktop_mission_outbox outbox
      WHERE outbox.provision_id=provision.id
        AND (outbox.state='needs_auth' OR (outbox.state IN ('pending','syncing','error') AND provision.expires_at<=?))
    )
    ORDER BY provision.created_at DESC LIMIT 1
  `).get(studentId, new Date().toISOString()) as { id: string } | undefined;
  return row ? getProvision(row.id) : null;
}

export function updateRecoveredProvision(input: { id: string; remoteToken: string; syncToken: string; expiresAt: string }) {
  const db = getDesktopDatabase();
  withDesktopTransaction(() => {
    const result = db.prepare(`
      UPDATE desktop_provisions SET remote_token_enc=?,expires_at=? WHERE id=?
    `).run(encrypt(JSON.stringify({ remoteToken: input.remoteToken, syncToken: input.syncToken })), input.expiresAt, input.id);
    if (!result.changes) throw new Error('DESKTOP_PROVISION_NOT_FOUND');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO desktop_sync_history(provision_id,operation_id,occurred_at,result,attempts,error_code)
      SELECT provision_id,operation_id,?,'reauthorized',attempts,NULL FROM desktop_mission_outbox
      WHERE provision_id=? AND state='needs_auth'`).run(now, input.id);
    db.prepare(`UPDATE desktop_mission_outbox SET state='pending',last_error=NULL,next_attempt_at=NULL
      WHERE provision_id=? AND state='needs_auth'`).run(input.id);
  });
}

export function listCachedModules(provisionId: string) {
  const db = getDesktopDatabase();
  const rows = db.prepare(`SELECT module_id,module_payload_enc,mission_payload_enc FROM desktop_mission_snapshots WHERE provision_id=? ORDER BY module_id,mission_id`).all(provisionId) as Array<Record<string, unknown>>;
  const modules = new Map<string, DesktopModule>();
  for (const row of rows) {
    const moduleId = String(row.module_id);
    let module = modules.get(moduleId);
    if (!module) {
      module = JSON.parse(decrypt(row.module_payload_enc as Uint8Array)) as DesktopModule;
      module.missions = [];
      modules.set(moduleId, module);
    }
    const mission = JSON.parse(decrypt(row.mission_payload_enc as Uint8Array)) as DesktopMission;
    const answerRow = db.prepare(`SELECT answers_enc,state,created_at,synced_at,result_enc FROM desktop_mission_outbox WHERE provision_id=? AND mission_id=?`).get(provisionId, mission.id) as Record<string, unknown> | undefined;
    if (answerRow) {
      const answers = JSON.parse(decrypt(answerRow.answers_enc as Uint8Array)) as Array<{ taskId: string; answer: unknown }>;
      const answerByTask = new Map(answers.map(item => [item.taskId, item.answer]));
      const result = answerRow.result_enc ? JSON.parse(decrypt(answerRow.result_enc as Uint8Array)) as Record<string, unknown> : null;
      const submittedAt = String((result?.submittedAt as string | undefined) || answerRow.synced_at || answerRow.created_at);
      mission.tasks = mission.tasks.map(task => ({
        ...task,
        submissions: [{ id: String(result?.responseId || answerRow.operation_id || ''), answer: answerByTask.get(task.id), submittedAt }],
        desktopSyncState: String(answerRow.state)
      }));
    }
    module.missions.push(mission);
  }
  return [...modules.values()]
    .sort((left, right) => left.position - right.position)
    .map(module => ({ ...module, missions: module.missions.sort((left, right) => left.position - right.position) }));
}

export function savePendingMission(input: {
  operationId: string; provisionId: string; studentId: string; missionId: string;
  snapshotHash: string; answers: Array<{ taskId: string; answer: unknown }>;
}) {
  const db = getDesktopDatabase();
  const snapshot = db.prepare(`SELECT snapshot_hash FROM desktop_mission_snapshots WHERE provision_id=? AND mission_id=?`).get(input.provisionId, input.missionId) as { snapshot_hash: string } | undefined;
  if (!snapshot || snapshot.snapshot_hash !== input.snapshotHash) throw new Error('DESKTOP_SNAPSHOT_CONFLICT');
  const existing = db.prepare(`SELECT operation_id FROM desktop_mission_outbox WHERE provision_id=? AND mission_id=?`).get(input.provisionId, input.missionId) as { operation_id: string } | undefined;
  if (existing) throw new Error('DESKTOP_MISSION_ALREADY_SUBMITTED');
  const serialized = JSON.stringify(input.answers);
  const payloadHash = createHash('sha256').update(serialized).digest('hex');
  const now = new Date().toISOString();
  withDesktopTransaction(() => db.prepare(`INSERT INTO desktop_mission_outbox
    (operation_id,provision_id,mission_id,snapshot_hash,answers_enc,payload_hash,state,created_at)
    VALUES(?,?,?,?,?,?,'pending',?)`).run(
    input.operationId, input.provisionId, input.missionId, input.snapshotHash,
    encrypt(serialized), payloadHash, now
  ));
  return { operationId: input.operationId, state: 'pending' as const, submittedAt: now };
}

export function listOutbox(studentId?: string): PendingMission[] {
  const rows = getDesktopDatabase().prepare(`SELECT outbox.*,provision.student_id FROM desktop_mission_outbox outbox
    JOIN desktop_provisions provision ON provision.id=outbox.provision_id
    WHERE (? IS NULL OR provision.student_id=?) AND outbox.state IN ('pending','syncing','conflict','needs_auth','error')
    ORDER BY outbox.created_at LIMIT 100`).all(studentId ?? null, studentId ?? null) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    operationId: String(row.operation_id), provisionId: String(row.provision_id), missionId: String(row.mission_id),
    snapshotHash: String(row.snapshot_hash), answers: JSON.parse(decrypt(row.answers_enc as Uint8Array)),
    state: String(row.state) as PendingMission['state'], attempts: Number(row.attempts),
    createdAt: String(row.created_at), lastError: row.last_error ? String(row.last_error) : null,
    result: row.result_enc ? JSON.parse(decrypt(row.result_enc as Uint8Array)) : null
  }));
}

export function getDesktopSyncPreferences(provisionId: string): DesktopSyncPreferences {
  const db = getDesktopDatabase();
  const row = db.prepare('SELECT automatic,interval_seconds,paused FROM desktop_sync_preferences WHERE provision_id=?').get(provisionId) as { automatic: number; interval_seconds: number; paused: number } | undefined;
  if (!row) return { automatic: true, intervalSeconds: 60, paused: false };
  return { automatic: row.automatic === 1, intervalSeconds: row.interval_seconds, paused: row.paused === 1 };
}

export function saveDesktopSyncPreferences(provisionId: string, input: DesktopSyncPreferences) {
  const now = new Date().toISOString();
  getDesktopDatabase().prepare(`INSERT INTO desktop_sync_preferences(provision_id,automatic,interval_seconds,paused,updated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(provision_id) DO UPDATE SET automatic=excluded.automatic,
    interval_seconds=excluded.interval_seconds,paused=excluded.paused,updated_at=excluded.updated_at`)
    .run(provisionId, input.automatic ? 1 : 0, input.intervalSeconds, input.paused ? 1 : 0, now);
  return input;
}

export function getDesktopSyncSummary(provisionId: string): DesktopSyncSummary {
  const db = getDesktopDatabase();
  const countRows = db.prepare(`SELECT state,COUNT(*) AS count FROM desktop_mission_outbox WHERE provision_id=? GROUP BY state`).all(provisionId) as Array<{ state: string; count: number }>;
  const counts = { synced: 0, pending: 0, syncing: 0, failed: 0, conflicts: 0, needsAuth: 0 };
  for (const row of countRows) {
    if (row.state === 'synced') counts.synced = Number(row.count);
    else if (row.state === 'pending') counts.pending = Number(row.count);
    else if (row.state === 'syncing') counts.syncing = Number(row.count);
    else if (row.state === 'error') counts.failed = Number(row.count);
    else if (row.state === 'conflict') counts.conflicts = Number(row.count);
    else if (row.state === 'needs_auth') counts.needsAuth = Number(row.count);
  }
  const run = db.prepare(`SELECT id,total,confirmed,started_at FROM desktop_sync_runs WHERE provision_id=? AND state='running' ORDER BY started_at DESC LIMIT 1`).get(provisionId) as { id: string; total: number; confirmed: number; started_at: string } | undefined;
  const latestRun = db.prepare(`SELECT id,total,confirmed,state,started_at,completed_at FROM desktop_sync_runs WHERE provision_id=? ORDER BY started_at DESC LIMIT 1`).get(provisionId) as { id: string; total: number; confirmed: number; state: string; started_at: string; completed_at: string | null } | undefined;
  const last = db.prepare(`SELECT MAX(synced_at) AS completed_at FROM desktop_mission_outbox WHERE provision_id=?`).get(provisionId) as { completed_at: string | null };
  const historyRows = db.prepare(`SELECT occurred_at,result,attempts,error_code FROM desktop_sync_history WHERE provision_id=? ORDER BY id DESC LIMIT 50`).all(provisionId) as Array<{ occurred_at: string; result: string; attempts: number; error_code: string | null }>;
  return {
    counts,
    lastCompletedAt: last.completed_at,
    activeRun: run ? { id: run.id, total: run.total, confirmed: run.confirmed, startedAt: run.started_at } : null,
    latestRun: latestRun ? { id: latestRun.id, total: latestRun.total, confirmed: latestRun.confirmed, state: latestRun.state, startedAt: latestRun.started_at, completedAt: latestRun.completed_at } : null,
    history: historyRows.map(row => ({ occurredAt: row.occurred_at, operationType: 'Resposta de missão', result: row.result, attempts: row.attempts, error: row.error_code }))
  };
}

export function acquireDesktopSyncRun(provisionId: string, runId: string, total: number): boolean {
  return withDesktopTransaction(db => {
    const now = new Date().toISOString();
    const lock = db.prepare('SELECT expires_at FROM desktop_sync_locks WHERE provision_id=?').get(provisionId) as { expires_at: string } | undefined;
    if (lock && Date.parse(lock.expires_at) > Date.now()) return false;
    db.prepare(`INSERT INTO desktop_sync_locks(provision_id,run_id,expires_at) VALUES(?,?,?)
      ON CONFLICT(provision_id) DO UPDATE SET run_id=excluded.run_id,expires_at=excluded.expires_at`)
      .run(provisionId, runId, new Date(Date.now() + 10 * 60_000).toISOString());
    db.prepare(`INSERT INTO desktop_sync_runs(id,provision_id,total,confirmed,state,started_at) VALUES(?,?,?,0,'running',?)`)
      .run(runId, provisionId, total, now);
    return true;
  });
}

export function isDesktopSyncRunActive(provisionId: string): boolean {
  const row = getDesktopDatabase().prepare('SELECT expires_at FROM desktop_sync_locks WHERE provision_id=?').get(provisionId) as { expires_at: string } | undefined;
  return Boolean(row && Date.parse(row.expires_at) > Date.now());
}

export function renewDesktopSyncLock(provisionId: string, runId: string) {
  getDesktopDatabase().prepare('UPDATE desktop_sync_locks SET expires_at=? WHERE provision_id=? AND run_id=?')
    .run(new Date(Date.now() + 10 * 60_000).toISOString(), provisionId, runId);
}

export function finishDesktopSyncRun(provisionId: string, runId: string, state: 'completed' | 'partial' | 'failed') {
  withDesktopTransaction(db => {
    db.prepare(`UPDATE desktop_sync_runs SET state=?,completed_at=? WHERE id=? AND provision_id=?`)
      .run(state, new Date().toISOString(), runId, provisionId);
    db.prepare('DELETE FROM desktop_sync_locks WHERE provision_id=? AND run_id=?').run(provisionId, runId);
  });
}

export function confirmDesktopSyncOperation(provisionId: string, runId: string) {
  getDesktopDatabase().prepare(`UPDATE desktop_sync_runs SET confirmed=MIN(total,confirmed+1) WHERE id=? AND provision_id=? AND state='running'`)
    .run(runId, provisionId);
}

export function listSyncableOutbox(provisionId: string, now = new Date().toISOString(), force = false): PendingMission[] {
  const rows = getDesktopDatabase().prepare(`SELECT * FROM desktop_mission_outbox WHERE provision_id=?
    AND (state='pending' OR (state='error' AND next_attempt_at IS NOT NULL AND (?=1 OR next_attempt_at<=?)))
    ORDER BY created_at LIMIT 500`).all(provisionId, force ? 1 : 0, now) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    operationId: String(row.operation_id), provisionId: String(row.provision_id), missionId: String(row.mission_id),
    snapshotHash: String(row.snapshot_hash), answers: JSON.parse(decrypt(row.answers_enc as Uint8Array)),
    state: String(row.state) as PendingMission['state'], attempts: Number(row.attempts), createdAt: String(row.created_at),
    lastError: row.last_error ? String(row.last_error) : null,
    result: row.result_enc ? JSON.parse(decrypt(row.result_enc as Uint8Array)) : null
  }));
}

export function countSyncableOutbox(provisionId: string, now = new Date().toISOString()) {
  const row = getDesktopDatabase().prepare(`SELECT COUNT(*) AS count FROM desktop_mission_outbox WHERE provision_id=?
    AND (state='pending' OR (state='error' AND next_attempt_at IS NOT NULL AND next_attempt_at<=?))`).get(provisionId, now) as { count: number };
  return Number(row.count);
}

export function scheduleOutboxRetry(operationId: string, nextAttemptAt: string) {
  getDesktopDatabase().prepare('UPDATE desktop_mission_outbox SET next_attempt_at=? WHERE operation_id=?').run(nextAttemptAt, operationId);
}

export function setOutboxState(operationId: string, state: PendingMission['state'], details?: { error?: string; result?: Record<string, unknown>; nextAttemptAt?: string | null }) {
  const db = getDesktopDatabase();
  const safeError = details?.error && /^[a-z0-9_-]{1,100}$/iu.test(details.error) ? details.error : details?.error ? 'operation_failed' : null;
  withDesktopTransaction(() => {
    db.prepare(`UPDATE desktop_mission_outbox SET state=?,attempts=attempts+CASE WHEN ?='syncing' THEN 1 ELSE 0 END,last_error=?,synced_at=?,result_enc=?,next_attempt_at=? WHERE operation_id=?`)
      .run(state, state, safeError, state === 'synced' ? new Date().toISOString() : null,
        details?.result ? encrypt(JSON.stringify(details.result)) : null, details?.nextAttemptAt ?? null, operationId);
    if (state !== 'syncing') {
      const row = db.prepare('SELECT provision_id,attempts FROM desktop_mission_outbox WHERE operation_id=?').get(operationId) as { provision_id: string; attempts: number } | undefined;
      if (row) db.prepare(`INSERT INTO desktop_sync_history(provision_id,operation_id,occurred_at,result,attempts,error_code)
        VALUES(?,?,?,?,?,?)`).run(row.provision_id, operationId, new Date().toISOString(), state, row.attempts, safeError);
    }
  });
}

export function closeDesktopDatabaseForTests() {
  database?.close();
  database = null;
}
