import test from 'node:test';
import assert from 'node:assert/strict';
import { academicEvaluationInputSchema, canEditEvaluation } from '../src/domain/academic-grade-policy.ts';

const valid = {
  targetKind: 'delivery', targetId: 'e4608ba4-a18d-4f8a-b2d1-7cf690de93a0',
  score: 8.5, maximumScore: 10, comment: 'Boa evolução.', publicationState: 'published'
};

test('academic evaluation accepts valid decimal grades and private draft state', () => {
  assert.equal(academicEvaluationInputSchema.safeParse(valid).success, true);
  assert.equal(academicEvaluationInputSchema.safeParse({ ...valid, score: 0, maximumScore: 4, publicationState: 'draft' }).success, true);
});

test('academic evaluation rejects scores above maximum, bounds, precision and unknown fields', () => {
  for (const input of [
    { ...valid, score: 10.01 }, { ...valid, score: -0.01 }, { ...valid, maximumScore: 0 },
    { ...valid, score: 7.777 }, { ...valid, publicationState: 'visible' }, { ...valid, studentId: 'other-user' }
  ]) assert.equal(academicEvaluationInputSchema.safeParse(input).success, false);
});

test('only the evaluating teacher or an admin can edit a saved evaluation', () => {
  assert.equal(canEditEvaluation('teacher', 'teacher-a', 'teacher-a'), true);
  assert.equal(canEditEvaluation('teacher', 'teacher-b', 'teacher-a'), false);
  assert.equal(canEditEvaluation('admin', 'admin-1', 'teacher-a'), true);
});
