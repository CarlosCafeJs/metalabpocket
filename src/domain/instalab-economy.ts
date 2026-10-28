export type DailyRewardPolicy = {
  postReward: number;
  dailyRewardCap: number;
};

export function defaultCampaignBudget(balance: number, intervalCost: number, preferredLimit = 100) {
  if (![balance, intervalCost, preferredLimit].every(Number.isFinite) || balance < 0 || intervalCost <= 0 || preferredLimit <= 0) return 0;
  const affordableLimit = Math.floor(balance / intervalCost) * intervalCost;
  const preferredBudget = Math.floor(preferredLimit / intervalCost) * intervalCost;
  return Math.max(intervalCost, Math.min(affordableLimit || intervalCost, preferredBudget || intervalCost));
}

export function rewardForValidPost(earnedToday: number, policy: DailyRewardPolicy) {
  if (!Number.isFinite(earnedToday) || earnedToday < 0 || !Number.isFinite(policy.postReward) || policy.postReward < 0) return 0;
  return Math.max(0, Math.min(policy.postReward, policy.dailyRewardCap - earnedToday));
}

export function rewardForEligibleInteraction(reward: number, earnedToday: number, dailyCap: number) {
  if (![reward, earnedToday, dailyCap].every(Number.isFinite) || reward < 0 || earnedToday < 0 || dailyCap < 0) return 0;
  return Math.max(0, Math.min(reward, dailyCap - earnedToday));
}
