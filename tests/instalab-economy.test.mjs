import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultCampaignBudget, rewardForEligibleInteraction, rewardForValidPost } from '../src/domain/instalab-economy.ts';

const defaults = { postReward: 20, dailyRewardCap: 200 };

test('awards 20 coins for each valid post within the daily cap', () => {
  assert.equal(rewardForValidPost(0, defaults), 20);
  assert.equal(rewardForValidPost(20, defaults), 20);
});

test('never crosses the daily cap and honors lower configured caps', () => {
  assert.equal(rewardForValidPost(190, defaults), 10);
  assert.equal(rewardForValidPost(0, { ...defaults, dailyRewardCap: 4 }), 4);
  assert.equal(rewardForValidPost(5, { ...defaults, dailyRewardCap: 4 }), 0);
});

test('caps interaction rewards and ignores invalid amounts', () => {
  assert.equal(rewardForValidPost(-1, defaults), 0);
  assert.equal(rewardForEligibleInteraction(15, 20, 200), 15);
  assert.equal(rewardForEligibleInteraction(15, 195, 200), 5);
  assert.equal(rewardForEligibleInteraction(15, 200, 200), 0);
  assert.equal(rewardForEligibleInteraction(-1, 0, 200), 0);
});

test('defaults campaign budget to affordable intervals with a 100 coin preference cap', () => {
  assert.equal(defaultCampaignBudget(10, 10), 10);
  assert.equal(defaultCampaignBudget(95, 10), 90);
  assert.equal(defaultCampaignBudget(1000, 10), 100);
  assert.equal(defaultCampaignBudget(0, 10), 10);
});
