import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktopDistDir = process.env.METALAB_DESKTOP_DIST_DIR || '.next-desktop-runtime';
if (!/^\.next-desktop-[a-z0-9-]+$/u.test(desktopDistDir)) throw new Error('METALAB_DESKTOP_DIST_DIR must be a local .next-desktop-* directory.');
async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const number = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return number;
}
const readJson = response => response.json().catch(() => ({}));

test('desktop offline mission survives restart and sync retries do not duplicate', { timeout: 120_000 }, async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'metalab-desktop-flow-'));
  const studentId = randomUUID(), classId = randomUUID(), moduleId = randomUUID(), missionId = randomUUID(), taskId = randomUUID(), conflictMissionId = randomUUID(), conflictTaskId = randomUUID(), invalidMissionId = randomUUID(), invalidTaskId = randomUUID(), expiredMissionId = randomUUID(), expiredTaskId = randomUUID(), provisionId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const recoveredSyncToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const mission = (id, task, title, position) => ({ id, moduleId, title, objective: 'Escreva uma resposta.', description: '', position, isPublished: true,
    tasks: [{ id: task, prompt: 'O que você aprendeu?', description: '', type: 'text', required: true, settings: {}, options: [], position: 1, isPublished: true }] });
  const module = { id: moduleId, title: 'Módulo de teste', description: 'Conteúdo autorizado', position: 1, isPublished: true,
    missions: [mission(missionId, taskId, 'Missão de teste', 1), mission(conflictMissionId, conflictTaskId, 'Missão em conflito', 2), mission(invalidMissionId, invalidTaskId, 'Missão rejeitada', 3), mission(expiredMissionId, expiredTaskId, 'Missão com autorização expirada', 4)] };
  const canonical = { module: { id: module.id, title: module.title, description: module.description, position: module.position }, mission: {
    id: missionId, moduleId, title: 'Missão de teste', objective: 'Escreva uma resposta.', description: '', position: 1, isPublished: true,
    tasks: [{ id: taskId, prompt: 'O que você aprendeu?', description: '', type: 'text', required: true, settings: {}, options: [], position: 1, isPublished: true }]
  } };
  const versions = { [missionId]: createHash('sha256').update(JSON.stringify(canonical)).digest('hex') };
  for (const item of module.missions.slice(1)) {
    const task = item.tasks[0];
    const snapshot = { module: { id: module.id, title: module.title, description: module.description, position: module.position }, mission: {
      id: item.id, moduleId, title: item.title, objective: item.objective, description: item.description, position: item.position, isPublished: item.isPublished,
      tasks: [{ id: task.id, prompt: task.prompt, description: task.description, type: task.type, required: task.required, settings: task.settings, options: task.options, position: task.position, isPublished: task.isPublished }]
    } };
    versions[item.id] = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  }
  const seen = new Set();
  const forcedResults = new Map();
  let syncRequests = 0, loginRequests = 0, recoveryRequests = 0, currentSyncToken = token, teacherLoginRequests = 0, dropFirstSyncReply = true, networkAvailable = true, identityMatches = true, identityStatus = 200, teacherLoginAccepted = true, syncDelayMs = 0, desktopTokenAuthorized = true;
  const backendPaths = [];
  const backend = createServer(async (request, response) => {
    backendPaths.push(request.url);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/desktop/identity' && request.method === 'GET') {
      response.statusCode = identityStatus;
      if (identityStatus !== 200) { response.end(JSON.stringify({ error: 'Not found' })); return; }
      response.end(JSON.stringify(identityMatches
        ? { application: 'metalab-pocket', capability: 'desktop-offline-sync', protocolVersion: 1 }
        : { application: 'another-service', capability: 'desktop-offline-sync', protocolVersion: 1 })); return;
    }
    if (request.url === '/api/students' && request.method === 'POST') {
      loginRequests++;
      response.setHeader('Set-Cookie', `metalab_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
      response.end(JSON.stringify({ student: { id: studentId, displayName: 'Aluna Teste' } })); return;
    }
    if (request.url === '/api/teacher/session' && request.method === 'POST') {
      teacherLoginRequests++;
      if (!teacherLoginAccepted) { response.statusCode = 401; response.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      response.setHeader('Set-Cookie', 'metalab_teacher_session=test-teacher-session; Path=/; HttpOnly; SameSite=Strict');
      response.end(JSON.stringify({ authenticated: true })); return;
    }
    if (request.url === '/api/student/desktop-sync' && body.action === 'provision') {
      response.end(JSON.stringify({ provisionId, syncToken: token, classId, expiresAt, modules: [module], versions, student: { id: studentId } })); return;
    }
    if (request.url === '/api/student/desktop-sync' && body.action === 'authorize') {
      response.statusCode = desktopTokenAuthorized ? 200 : 401;
      response.end(JSON.stringify({ authorized: desktopTokenAuthorized })); return;
    }
    if (request.url === '/api/student/desktop-sync' && body.action === 'recover') {
      recoveryRequests++;
      assert.equal(request.headers.cookie, `metalab_session=${token}`, 'recovery requires a newly authenticated online student session');
      assert.equal(body.provisionId, provisionId, 'recovery keeps the original provision identifier');
      currentSyncToken = recoveredSyncToken;
      response.end(JSON.stringify({ recovered: true, provisionId, syncToken: recoveredSyncToken, classId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })); return;
    }
    if (request.url === '/api/student/desktop-sync' && body.action === 'sync') {
      assert.equal(request.headers.authorization, `DesktopSync ${currentSyncToken}`, 'sync uses the latest server-issued provision credential');
      if (!networkAvailable) { response.destroy(); return; }
      if (syncDelayMs) await new Promise(resolve => setTimeout(resolve, syncDelayMs));
      syncRequests++;
      const results = body.operations.map(operation => {
        const duplicate = seen.has(operation.operationId); seen.add(operation.operationId);
        const state = forcedResults.get(operation.missionId) || 'synced';
        return { operationId: operation.operationId, state, duplicate, ...(state === 'synced' ? { result: { responseId: randomUUID(), submissionCount: 1, submittedAt: new Date().toISOString() } } : { error: 'private remote detail must not be shown' }) };
      });
      if (dropFirstSyncReply) { dropFirstSyncReply = false; response.destroy(); return; }
      response.end(JSON.stringify({ results })); return;
    }
    response.statusCode = 404; response.end(JSON.stringify({ error: 'Not found' }));
  });
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const backendUrl = `http://127.0.0.1:${backend.address().port}`;
  const localPort = await reservePort();
  const env = { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(localPort), METALAB_DESKTOP_MODE: '1',
    METALAB_DESKTOP_TEST_MODE: '1', METALAB_DESKTOP_TEST_BACKEND_URL: backendUrl,
    METALAB_DESKTOP_DB_PATH: path.join(temp, 'offline.sqlite'), METALAB_DESKTOP_DATA_KEY: randomBytes(32).toString('hex'), NEXT_TELEMETRY_DISABLED: '1' };
  const serverEntry = path.join(root, desktopDistDir, 'standalone', 'server.js');
  let app, auxiliaryApp, appOutput = '';
  const startServer = async () => {
    app = spawn(process.execPath, [serverEntry], { cwd: path.dirname(serverEntry), env, stdio: ['ignore', 'pipe', 'pipe'] });
    app.stdout.on('data', chunk => { appOutput += chunk.toString(); }); app.stderr.on('data', chunk => { appOutput += chunk.toString(); });
    const url = `http://127.0.0.1:${localPort}`, until = Date.now() + 35_000;
    while (Date.now() < until) {
      if (app.exitCode !== null) throw new Error(`Local Next server exited: ${appOutput}`);
      try { if ((await fetch(`${url}/api/desktop/health`)).ok) return url; } catch { /* wait until ready */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Local Next server readiness timed out: ${appOutput}`);
  };
  const stopServer = async () => {
    if (!app || app.exitCode !== null) return;
    app.kill(); await Promise.race([once(app, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]);
  };
  const stopAuxiliaryServer = async () => {
    if (!auxiliaryApp || auxiliaryApp.exitCode !== null) return;
    auxiliaryApp.kill(); await Promise.race([once(auxiliaryApp, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]);
  };
  t.after(async () => { await stopServer(); await stopAuxiliaryServer(); await new Promise(resolve => backend.close(resolve)); await rm(temp, { recursive: true, force: true }); });

  let localUrl = await startServer();
  const localOrigin = new URL(localUrl).origin;
  const config = await readJson(await fetch(`${localUrl}/api/desktop/config`));
  assert.equal(config.backendOrigin, backendUrl, 'automated Desktop tests use their mock backend instead of the production domain');
  const settingsResponse = await fetch(`${localUrl}/api/desktop/config`, { method: 'POST', headers: { Origin: localOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ backendUrl: `${backendUrl}/dashboard`, teacherCpf: 'teacher-test', teacherPassword: 'test-only-password' }) });
  const savedSettings = await readJson(settingsResponse);
  assert.equal(settingsResponse.status, 200, JSON.stringify(savedSettings));
  assert.equal(savedSettings.backendOrigin, backendUrl, 'the settings route validates teacher authorization and persists only the normalized origin');
  assert.equal(teacherLoginRequests, 1, 'settings authorization goes through the isolated mock backend');
  const connectStartIndex = backendPaths.length;
  const connected = await fetch(`${localUrl}/api/desktop/connect`, { method: 'POST', headers: { Origin: localOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Aluna Teste', email: 'aluna@example.com', birthDate: '2000-01-01', website: '', photoSharingConsent: true }) });
  const connectedBody = await readJson(connected);
  assert.equal(connected.status, 200, JSON.stringify(connectedBody));
  assert.deepEqual(backendPaths.slice(connectStartIndex, connectStartIndex + 3), ['/api/desktop/identity', '/api/students', '/api/student/desktop-sync'], 'dashboard path normalizes to origin and is checked before student credentials are sent');
  const sessionCookie = connected.headers.getSetCookie().map(item => item.split(';', 1)[0]).find(item => item.startsWith('metalab_desktop_session='));
  assert.ok(sessionCookie, 'connection must issue a local HttpOnly session cookie');
  const headers = { Cookie: sessionCookie, Origin: localOrigin, 'Content-Type': 'application/json' };
  const defaultPreferences = await readJson(await fetch(`${localUrl}/api/desktop/sync/preferences`, { headers }));
  assert.deepEqual(defaultPreferences.preferences, { automatic: true, intervalSeconds: 60, paused: false });
  const crossOriginDiagnostics = await fetch(`${localUrl}/api/desktop/sync/status`, { headers: { ...headers, Origin: 'http://attacker.example' } });
  assert.equal(crossOriginDiagnostics.status, 403, 'local diagnostics reject a foreign Origin');
  const invalidPreferences = await fetch(`${localUrl}/api/desktop/sync/preferences`, { method: 'PATCH', headers, body: JSON.stringify({ intervalSeconds: 5 }) });
  assert.equal(invalidPreferences.status, 400, 'preference polling interval stays within safe bounds');
  const configuredPreferences = await fetch(`${localUrl}/api/desktop/sync/preferences`, { method: 'PATCH', headers, body: JSON.stringify({ intervalSeconds: 30, automatic: true, paused: true }) });
  assert.deepEqual((await readJson(configuredPreferences)).preferences, { automatic: true, intervalSeconds: 30, paused: true }, 'sync preferences are persisted locally');
  identityMatches = false;
  const incompatible = await fetch(`${localUrl}/api/desktop/connect`, { method: 'POST', headers: { Origin: localOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Aluna Teste', email: 'aluna@example.com', birthDate: '2000-01-01', website: '', photoSharingConsent: true }) });
  assert.equal(incompatible.status, 502, 'an incompatible server is rejected before login');
  assert.equal(loginRequests, 1, 'student details are never sent before MetaLab identity validation');
  identityMatches = true;
  identityStatus = 404;
  const missingIdentity = await fetch(`${localUrl}/api/desktop/connect`, { method: 'POST', headers: { Origin: localOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Aluna Teste', email: 'aluna@example.com', birthDate: '2000-01-01', website: '', photoSharingConsent: true }) });
  const missingIdentityBody = await readJson(missingIdentity);
  assert.equal(missingIdentity.status, 502);
  assert.match(missingIdentityBody.error, /HTTP 404/u, 'a missing production identity route is distinguished from network failure');
  assert.equal(loginRequests, 1, 'no student data is sent when the identity endpoint is missing');
  identityMatches = true;
  identityStatus = 200;
  const blockedOrigin = await fetch(`${localUrl}/api/desktop/classroom/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(blockedOrigin.status, 403, 'mutating local APIs require a matching loopback Origin');
  networkAvailable = false;
  let classroomResponse = await fetch(`${localUrl}/api/desktop/classroom`, { headers });
  let classroom = await readJson(classroomResponse);
  assert.equal(classroomResponse.status, 200); assert.equal(classroom.modules[0].missions[0].id, missionId);
  const submission = await fetch(`${localUrl}/api/desktop/classroom/submissions`, { method: 'POST', headers, body: JSON.stringify({ missionId, answers: [{ taskId, answer: 'Resposta offline persistente.' }] }) });
  assert.equal(submission.status, 201, JSON.stringify(await readJson(submission)));
  classroomResponse = await fetch(`${localUrl}/api/desktop/classroom`, { headers }); classroom = await readJson(classroomResponse);
  assert.equal(classroom.modules[0].missions[0].tasks[0].submissions[0].answer, 'Resposta offline persistente.');
  await stopServer();

  localUrl = await startServer();
  classroomResponse = await fetch(`${localUrl}/api/desktop/classroom`, { headers }); classroom = await readJson(classroomResponse);
  assert.equal(classroomResponse.status, 200);
  assert.equal(classroom.modules[0].missions[0].tasks[0].submissions[0].answer, 'Resposta offline persistente.', 'answer must survive a server restart');
  const restoredPreferences = await readJson(await fetch(`${localUrl}/api/desktop/sync/preferences`, { headers }));
  assert.deepEqual(restoredPreferences.preferences, { automatic: true, intervalSeconds: 30, paused: true }, 'sync preferences survive a local server restart');
  desktopTokenAuthorized = false;
  const expiredAuthorization = await readJson(await fetch(`${localUrl}/api/desktop/sync/status`, { headers }));
  assert.equal(expiredAuthorization.api.reachable, true);
  assert.equal(expiredAuthorization.api.authorized, false, 'server connectivity and authorization are reported separately');
  assert.equal(expiredAuthorization.api.error, 'remote_unauthorized');
  desktopTokenAuthorized = true;
  networkAvailable = true;
  const pausedAutoSync = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers, body: JSON.stringify({ source: 'automatic' }) });
  assert.equal(pausedAutoSync.status, 409);
  assert.equal((await readJson(pausedAutoSync)).paused, true, 'automatic sync respects pause');
  const pausedManualSync = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers });
  assert.equal(pausedManualSync.status, 409, 'pause blocks new manual and automatic rounds without interrupting an active run');
  assert.equal(syncRequests, 0);
  await fetch(`${localUrl}/api/desktop/sync/preferences`, { method: 'PATCH', headers, body: JSON.stringify({ paused: false }) });
  syncDelayMs = 500;
  const auxiliaryPort = await reservePort();
  auxiliaryApp = spawn(process.execPath, [serverEntry], { cwd: path.dirname(serverEntry), env: { ...env, PORT: String(auxiliaryPort) }, stdio: ['ignore', 'ignore', 'ignore'] });
  const auxiliaryUrl = `http://127.0.0.1:${auxiliaryPort}`;
  const auxiliaryUntil = Date.now() + 35_000;
  while (Date.now() < auxiliaryUntil) {
    if (auxiliaryApp.exitCode !== null) throw new Error('Auxiliary local Next server exited before readiness.');
    try { if ((await fetch(`${auxiliaryUrl}/api/desktop/health`)).ok) break; } catch { /* wait until ready */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  await fetch(`${auxiliaryUrl}/api/desktop/sync/status`, { headers: { ...headers, Origin: auxiliaryUrl } });
  const firstSyncPromise = fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers });
  await new Promise(resolve => setTimeout(resolve, 150));
  const concurrentSync = await fetch(`${auxiliaryUrl}/api/desktop/sync`, { method: 'POST', headers: { ...headers, Origin: auxiliaryUrl } });
  assert.equal(concurrentSync.status, 409, 'a second Next process cannot start a concurrent sync run');
  const firstSync = await firstSyncPromise;
  assert.equal(firstSync.status, 503, 'a lost sync acknowledgment must keep the outbox retryable');
  await stopAuxiliaryServer();
  syncDelayMs = 0;
  const automaticBeforeBackoff = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers, body: JSON.stringify({ source: 'automatic' }) });
  assert.equal((await readJson(automaticBeforeBackoff)).results.length, 0, 'automatic retry honors its backoff window');
  assert.equal(syncRequests, 1);
  const localDatabase = new DatabaseSync(path.join(temp, 'offline.sqlite'));
  localDatabase.prepare('UPDATE desktop_mission_outbox SET next_attempt_at=?').run('2000-01-01T00:00:00.000Z');
  localDatabase.close();
  const automaticRetry = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers, body: JSON.stringify({ source: 'automatic' }) });
  assert.equal(automaticRetry.status, 200, await automaticRetry.text()); assert.equal(seen.size, 1, 'retry reuses the same operation UUID');
  const retry = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers });
  assert.equal(retry.status, 200); assert.equal(syncRequests, 2, 'already confirmed operations are not sent by manual retry');
  const noOpRetry = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers });
  assert.equal(noOpRetry.status, 200); assert.equal(syncRequests, 2, 'synced operations are not sent again');
  classroomResponse = await fetch(`${localUrl}/api/desktop/classroom`, { headers }); classroom = await readJson(classroomResponse);
  assert.equal(classroom.modules[0].missions[0].tasks[0].desktopSyncState, 'synced');
  const syncStatus = await readJson(await fetch(`${localUrl}/api/desktop/sync/status`, { headers }));
  assert.equal(syncStatus.api.reachable, true, 'the official API is probed separately from the device network state');
  assert.deepEqual(syncStatus.summary.counts, { synced: 1, pending: 0, syncing: 0, failed: 0, conflicts: 0, needsAuth: 0 });
  assert.equal(syncStatus.summary.latestRun.total, 1);
  assert.equal(syncStatus.summary.latestRun.confirmed, 1, 'progress is based on server confirmations');
  assert.equal(syncStatus.summary.history[0].result, 'synced');
  assert.equal(syncStatus.summary.history[0].attempts, 2);
  networkAvailable = false;
  for (const [extraMissionId, extraTaskId] of [[conflictMissionId, conflictTaskId], [invalidMissionId, invalidTaskId]]) {
    const extra = await fetch(`${localUrl}/api/desktop/classroom/submissions`, { method: 'POST', headers, body: JSON.stringify({ missionId: extraMissionId, answers: [{ taskId: extraTaskId, answer: 'Resposta pendente.' }] }) });
    assert.equal(extra.status, 201, 'each additional answer is safely stored offline');
  }
  forcedResults.set(conflictMissionId, 'conflict');
  forcedResults.set(invalidMissionId, 'invalid');
  networkAvailable = true;
  const conflictRound = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers, body: JSON.stringify({ source: 'automatic' }) });
  assert.equal(conflictRound.status, 200);
  const conflictStatus = await readJson(await fetch(`${localUrl}/api/desktop/sync/status`, { headers }));
  assert.equal(conflictStatus.summary.counts.conflicts, 1, 'remote snapshot conflicts are recorded separately');
  assert.equal(conflictStatus.summary.counts.failed, 1, 'definitively rejected operations remain visible as failures');
  assert.equal(conflictStatus.summary.latestRun.total, 2);
  assert.equal(conflictStatus.summary.latestRun.confirmed, 0, 'non-confirmed outcomes do not advance progress');
  assert.equal(conflictStatus.summary.history.some(entry => entry.error === 'private remote detail must not be shown'), false, 'history does not expose remote response details');
  const noInfiniteRetry = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers, body: JSON.stringify({ source: 'automatic' }) });
  assert.equal((await readJson(noInfiniteRetry)).results.length, 0, 'conflicts and definitive rejections are not retried automatically');
  networkAvailable = false;
  const expiredAnswer = await fetch(`${localUrl}/api/desktop/classroom/submissions`, { method: 'POST', headers, body: JSON.stringify({ missionId: expiredMissionId, answers: [{ taskId: expiredTaskId, answer: 'Resposta preservada até reautorização.' }] }) });
  assert.equal(expiredAnswer.status, 201);
  desktopTokenAuthorized = false;
  const expiredSync = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers });
  assert.equal(expiredSync.status, 503);
  const authRequiredStatus = await readJson(await fetch(`${localUrl}/api/desktop/sync/status`, { headers }));
  assert.equal(authRequiredStatus.summary.counts.needsAuth, 1, 'expired authorization is a terminal visible state until reauthorization');
  const preservedClassroom = await readJson(await fetch(`${localUrl}/api/desktop/classroom`, { headers }));
  assert.equal(preservedClassroom.modules[0].missions.find(item => item.id === expiredMissionId).tasks[0].submissions[0].answer, 'Resposta preservada até reautorização.', 'authorization failure never deletes the local answer');
  const noAuthRetry = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers, body: JSON.stringify({ source: 'automatic' }) });
  assert.equal((await readJson(noAuthRetry)).results.length, 0, 'expired authorization is not retried indefinitely');
  desktopTokenAuthorized = true;
  networkAvailable = true;
  const pendingBeforeRecovery = new DatabaseSync(path.join(temp, 'offline.sqlite'));
  const pendingOperationBeforeRecovery = pendingBeforeRecovery.prepare("SELECT operation_id,provision_id,state FROM desktop_mission_outbox WHERE mission_id=?").get(expiredMissionId);
  pendingBeforeRecovery.close();
  assert.equal(pendingOperationBeforeRecovery.state, 'needs_auth');
  const recoveryStartIndex = backendPaths.length;
  const recoveredConnection = await fetch(`${localUrl}/api/desktop/connect`, { method: 'POST', headers: { Origin: localOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Aluna Teste', email: 'aluna@example.com', birthDate: '2000-01-01', website: '', photoSharingConsent: true }) });
  const recoveredConnectionBody = await readJson(recoveredConnection);
  assert.equal(recoveredConnection.status, 200, JSON.stringify(recoveredConnectionBody));
  assert.equal(recoveredConnectionBody.recovered, true, 'an online login recovers the old grant instead of silently orphaning pending work');
  assert.equal(recoveryRequests, 1);
  assert.deepEqual(backendPaths.slice(recoveryStartIndex, recoveryStartIndex + 3), ['/api/desktop/identity', '/api/students', '/api/student/desktop-sync']);
  const recoveredCookie = recoveredConnection.headers.getSetCookie().map(item => item.split(';', 1)[0]).find(item => item.startsWith('metalab_desktop_session='));
  assert.ok(recoveredCookie);
  const recoveredHeaders = { Cookie: recoveredCookie, Origin: localOrigin, 'Content-Type': 'application/json' };
  const pendingAfterRecovery = new DatabaseSync(path.join(temp, 'offline.sqlite'));
  const recoveredOperation = pendingAfterRecovery.prepare("SELECT operation_id,provision_id,state FROM desktop_mission_outbox WHERE mission_id=?").get(expiredMissionId);
  pendingAfterRecovery.close();
  assert.equal(recoveredOperation.operation_id, pendingOperationBeforeRecovery.operation_id, 'operation UUID remains stable through reauthorization');
  assert.equal(recoveredOperation.provision_id, pendingOperationBeforeRecovery.provision_id, 'the existing provision scope is retained');
  assert.equal(recoveredOperation.state, 'pending', 'only authorization-blocked answers become eligible after revalidation');
  const recoveredSync = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers: recoveredHeaders });
  assert.equal(recoveredSync.status, 200, await recoveredSync.text());
  assert.equal(syncRequests, 4, 'the preserved answer syncs after reauthentication');
  const recoveredStatus = await readJson(await fetch(`${localUrl}/api/desktop/sync/status`, { headers: recoveredHeaders }));
  assert.equal(recoveredStatus.summary.counts.needsAuth, 0);
  assert.equal(recoveredStatus.summary.counts.synced, 2);
  assert.equal(recoveredStatus.summary.history.some(entry => entry.result === 'reauthorized'), true, 'recovery is visible in sanitized local history');
  await stopServer();
  const database = new DatabaseSync(path.join(temp, 'offline.sqlite'));
  const encryptedAnswer = database.prepare('SELECT answers_enc FROM desktop_mission_outbox LIMIT 1').get().answers_enc;
  const encryptedRemoteToken = database.prepare('SELECT remote_token_enc FROM desktop_provisions LIMIT 1').get().remote_token_enc;
  assert.equal(Buffer.from(encryptedAnswer).includes(Buffer.from('Resposta offline persistente.')), false, 'answer is encrypted at rest');
  assert.equal(Buffer.from(encryptedRemoteToken).includes(Buffer.from(token)), false, 'remote session token is encrypted at rest');
  database.close();
});
