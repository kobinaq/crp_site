export const RUBRIC = [
  { id: "commitment", label: "Commitment", min: 1, max: 5 },
  { id: "context", label: "Lived context", min: 1, max: 5 },
  { id: "contribution", label: "Contribution", min: 1, max: 5 },
] as const;

export const RECOMMENDATIONS = ["advance", "discuss", "decline"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export type CriterionId = (typeof RUBRIC)[number]["id"];

export type ScoreInput = Partial<Record<CriterionId, number | null>>;

export function isRecommendation(value: string): value is Recommendation {
  for (const item of RECOMMENDATIONS) if (item === value) return true;
  return false;
}

export function parseScores(input: unknown): { ok: true; scores: ScoreInput } | { ok: false } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false };
  const scores: ScoreInput = {};
  for (const [key, value] of Object.entries(input)) {
    const criterion = RUBRIC.find((item) => item.id === key);
    if (!criterion) return { ok: false };
    if (value === null) {
      scores[criterion.id] = null;
      continue;
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value < criterion.min || value > criterion.max) return { ok: false };
    scores[criterion.id] = value;
  }
  return { ok: true, scores };
}

export function currentCriteria(scores: Readonly<Record<string, number>>): CriterionId[] {
  return RUBRIC.flatMap((item) => (scores[item.id] === undefined ? [] : [item.id]));
}

export function retiredScoreKeys(scores: Readonly<Record<string, number>>): string[] {
  const current = new Set<string>(RUBRIC.map((item) => item.id));
  return Object.keys(scores).filter((key) => !current.has(key)).sort();
}
