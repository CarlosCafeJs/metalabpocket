import test from 'node:test';
import assert from 'node:assert/strict';
import { instaflowRatingInputSchema } from '../src/domain/instaflow-rating-policy.ts';

test('InstaFlow rating accepts whole stars from one to five', () => {
  for (const stars of [1, 2, 3, 4, 5]) assert.equal(instaflowRatingInputSchema.safeParse({ stars }).success, true);
});

test('InstaFlow rating rejects zero, values above five, fractions and extra fields', () => {
  for (const value of [{ stars: 0 }, { stars: 6 }, { stars: 3.5 }, { stars: 4, postId: 'forged' }]) {
    assert.equal(instaflowRatingInputSchema.safeParse(value).success, false);
  }
});
