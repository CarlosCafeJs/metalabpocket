import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidTeacherCpf, nextTeacherAccountState } from '../src/domain/teacher-account-policy.ts';

test('teacher signup CPF validation accepts a valid formatted CPF and rejects invalid values', () => {
  assert.equal(isValidTeacherCpf('529.982.247-25'), true);
  assert.equal(isValidTeacherCpf('52998224724'), false);
  assert.equal(isValidTeacherCpf('111.111.111-11'), false);
  assert.equal(isValidTeacherCpf('123'), false);
});

test('teacher account state changes follow the approval and suspension lifecycle', () => {
  assert.equal(nextTeacherAccountState('pending', 'approve'), 'active');
  assert.equal(nextTeacherAccountState('pending', 'reject'), 'rejected');
  assert.equal(nextTeacherAccountState('active', 'suspend'), 'suspended');
  assert.equal(nextTeacherAccountState('suspended', 'reactivate'), 'active');
  assert.equal(nextTeacherAccountState('active', 'disable'), 'disabled');
});

test('teacher account state changes reject invalid transitions', () => {
  assert.equal(nextTeacherAccountState('rejected', 'approve'), null);
  assert.equal(nextTeacherAccountState('pending', 'suspend'), null);
  assert.equal(nextTeacherAccountState('disabled', 'reactivate'), null);
});
