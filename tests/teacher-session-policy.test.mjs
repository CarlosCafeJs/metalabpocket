import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessTeacherAdmin, rejectLegacyTeacherSession } from '../src/domain/teacher-session-policy.ts';

test('legacy teacher cookie formats no longer authenticate', () => {
  assert.equal(rejectLegacyTeacherSession('1700000000.nonce.legacy-signature'), false);
  assert.equal(rejectLegacyTeacherSession('1700000000.nonce.12345678901.legacy-signature'), false);
});

test('only a database-backed administrator role may use global administration', () => {
  assert.equal(canAccessTeacherAdmin('admin'), true);
  assert.equal(canAccessTeacherAdmin('teacher'), false);
  assert.equal(canAccessTeacherAdmin(null), false);
  assert.equal(canAccessTeacherAdmin('legacy-admin'), false);
});
