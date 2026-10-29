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
  const studentId = randomUUID(), classId = randomUUID(), moduleId = randomUUID(), missionId = randomUUID(), taskId = randomUUID(), provisionId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const module = { id: moduleId, title: 'Módulo de teste', description: 'Conteúdo autorizado', position: 1, isPublished: true,
    missions: [{ id: missionId, moduleId, title: 'Missão de teste', objective: 'Escreva uma resposta.', description: '', position: 1, isPublished: true,
      tasks: [{ id: taskId, prompt: 'O que você aprendeu?', description: '', type: 'text', required: true, settings: {}, options: [], position: 1, isPublished: true }] }] };
  const canonical = { module: { id: module.id, title: module.title, description: module.description, position: module.position }, mission: {
    id: missionId, moduleId, title: 'Missão de teste', objective: 'Escreva uma resposta.', description: '', position: 1, isPublished: true,
    tasks: [{ id: taskId, prompt: 'O que você aprendeu?', description: '', type: 'text', required: true, settings: {}, options: [], position: 1, isPublished: true }]
  } };
  const versions = { [missionId]: createHash('sha256').update(JSON.stringify(canonical)).digest('hex') };
  const seen = new Set();
  let syncRequests = 0, loginRequests = 0, teacherLoginRequests = 0, dropFirstSyncReply = true, networkAvailable = true, identityMatches = true, identityStatus = 200, teacherLoginAccepted = true;
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
    if (request.url === '/api/student/desktop-sync' && body.action === 'sync') {
      assert.equal(request.headers.authorization, `DesktopSync ${token}`, 'sync uses a server-issued provision credential');
      if (!networkAvailable) { response.destroy(); return; }
      syncRequests++;
      const results = body.operations.map(operation => {
        const duplicate = seen.has(operation.operationId); seen.add(operation.operationId);
        return { operationId: operation.operationId, state: 'synced', duplicate, result: { responseId: randomUUID(), submissionCount: 1, submittedAt: new Date().toISOString() } };
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
  let app, appOutput = '';
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
  t.after(async () => { await stopServer(); await new Promise(resolve => backend.close(resolve)); await rm(temp, { recursive: true, force: true }); });

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
  networkAvailable = true;
  const firstSync = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers });
  assert.equal(firstSync.status, 503, 'a lost sync acknowledgment must keep the outbox retryable');
  const retry = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers });
  assert.equal(retry.status, 200, await retry.text()); assert.equal(seen.size, 1, 'retry reuses the same operation UUID');
  const noOpRetry = await fetch(`${localUrl}/api/desktop/sync`, { method: 'POST', headers });
  assert.equal(noOpRetry.status, 200); assert.equal(syncRequests, 2, 'synced operations are not sent again');
  classroomResponse = await fetch(`${localUrl}/api/desktop/classroom`, { headers }); classroom = await readJson(classroomResponse);
  assert.equal(classroom.modules[0].missions[0].tasks[0].desktopSyncState, 'synced');
  await stopServer();
  const database = new DatabaseSync(path.join(temp, 'offline.sqlite'));
  const encryptedAnswer = database.prepare('SELECT answers_enc FROM desktop_mission_outbox LIMIT 1').get().answers_enc;
  const encryptedRemoteToken = database.prepare('SELECT remote_token_enc FROM desktop_provisions LIMIT 1').get().remote_token_enc;
  assert.equal(Buffer.from(encryptedAnswer).includes(Buffer.from('Resposta offline persistente.')), false, 'answer is encrypted at rest');
  assert.equal(Buffer.from(encryptedRemoteToken).includes(Buffer.from(token)), false, 'remote session token is encrypted at rest');
  database.close();
});
