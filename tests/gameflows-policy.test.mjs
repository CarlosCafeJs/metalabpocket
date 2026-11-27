import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAMEFLOW_SAMPLE_CASE, GAMEFLOW_GATE_TYPES, gameFlowCaseInputSchema,
  gameFlowGateInputSchema, evaluateGameFlowAnswer, normalizeGameFlowAnswer,
  splitCollectiveFragments, nextGameFlowSessionState
} from '../src/domain/gameflows.ts';

test('the demonstration investigation is valid and uses all ten gate mechanics', () => {
  assert.equal(gameFlowCaseInputSchema.safeParse(GAMEFLOW_SAMPLE_CASE).success, true);
  assert.equal(GAMEFLOW_SAMPLE_CASE.gates.length, 10);
  assert.deepEqual(new Set(GAMEFLOW_SAMPLE_CASE.gates.map(gate => gate.type)), new Set(GAMEFLOW_GATE_TYPES));
  assert.equal(gameFlowCaseInputSchema.safeParse({ ...GAMEFLOW_SAMPLE_CASE, gates: GAMEFLOW_SAMPLE_CASE.gates.slice(0, 4) }).success, false);
  assert.equal(gameFlowCaseInputSchema.safeParse({ ...GAMEFLOW_SAMPLE_CASE, gates: [...GAMEFLOW_SAMPLE_CASE.gates, GAMEFLOW_SAMPLE_CASE.gates[0]] }).success, false);
});

test('gate schemas reject missing answers and inconsistent structured challenge configurations', () => {
  assert.equal(gameFlowGateInputSchema.safeParse({ ...GAMEFLOW_SAMPLE_CASE.gates[2], answers: ['only one'] }).success, false);
  assert.equal(gameFlowGateInputSchema.safeParse({ ...GAMEFLOW_SAMPLE_CASE.gates[6], answers: ['one event'] }).success, false);
  assert.equal(gameFlowGateInputSchema.safeParse({ ...GAMEFLOW_SAMPLE_CASE.gates[9], items: [] }).success, false);
});

test('answers normalize accents and punctuation, but ordered challenges require every answer in order', () => {
  assert.equal(normalizeGameFlowAnswer('  Lei Geral de Proteção de Dados! '), 'lei geral de protecao de dados');
  assert.equal(evaluateGameFlowAnswer('scene_exploration', ['LGPD', 'Lei Geral de Proteção de Dados'], 'lei geral de proteção de dados'), 'correct');
  assert.equal(evaluateGameFlowAnswer('timeline', ['um', 'dois', 'três'], ['um', 'três', 'dois']), 'incorrect');
  assert.equal(evaluateGameFlowAnswer('ai_audit', ['fato', 'hipótese'], ['fato']), 'incorrect');
  assert.equal(evaluateGameFlowAnswer('verdict', [], 'qualquer texto'), 'pending_review');
});

test('collective fragment assignment distributes every unit and gives every participant material', () => {
  for (const count of [1, 2, 3, 7, 25]) {
    const phrase = 'A SEGURANÇA DIGITAL DEPENDE DE TODOS NÓS';
    const pieces = splitCollectiveFragments(phrase, count);
    assert.equal(pieces.length, count);
    assert.ok(pieces.every(participant => participant.length > 0));
    const units = phrase.trim().split(/\s+/u).length >= count ? phrase.trim().split(/\s+/u) : Array.from(phrase.replace(/\s/gu, ''));
    assert.deepEqual(pieces.flat().sort(), [...units].sort());
  }
  assert.throws(() => splitCollectiveFragments('oi', 4), /GAMEFLOW_FRAGMENT_CAPACITY/);
  assert.throws(() => splitCollectiveFragments('x', 0), /GAMEFLOW_EMPTY_ROSTER/);
});

test('session state transitions reject duplicate or out-of-order actions', () => {
  assert.equal(nextGameFlowSessionState('waiting', 'start'), 'running');
  assert.equal(nextGameFlowSessionState('waiting', 'cancel'), 'cancelled');
  assert.equal(nextGameFlowSessionState('running', 'pause'), 'paused');
  assert.equal(nextGameFlowSessionState('paused', 'resume'), 'running');
  assert.equal(nextGameFlowSessionState('completed', 'resume'), null);
  assert.equal(nextGameFlowSessionState('running', 'cancel'), null);
});
