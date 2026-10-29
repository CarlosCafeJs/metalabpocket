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
  // A process crash must leave an operation retryable. The remote operation id is idempotent.
  database.exec(`UPDATE desktop_mission_outbox SET state='pending' WHERE state='syncing'`);
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
  return [...modules.values()];
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

export function setOutboxState(operationId: string, state: PendingMission['state'], details?: { error?: string; result?: Record<string, unknown> }) {
  const db = getDesktopDatabase();
  db.prepare(`UPDATE desktop_mission_outbox SET state=?,attempts=attempts+CASE WHEN ?='syncing' THEN 1 ELSE 0 END,last_error=?,synced_at=?,result_enc=? WHERE operation_id=?`)
    .run(state, state, details?.error?.slice(0, 250) || null, state === 'synced' ? new Date().toISOString() : null,
      details?.result ? encrypt(JSON.stringify(details.result)) : null, operationId);
}

export function closeDesktopDatabaseForTests() {
  database?.close();
  database = null;
}
