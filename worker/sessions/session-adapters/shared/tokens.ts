export interface TokenBudget {
  remaining: number;
  threshold: number;
}

export const withinBudget = (budget: TokenBudget | undefined, cost: number): boolean => {
  if (!budget) {
    return true;
  }

  const projected = budget.remaining - cost;
  return projected >= budget.threshold;
};
