import type { SeriesCadence } from "./types";

const LABEL: Record<SeriesCadence, string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  quarterly: "Every three months",
  annual: "Yearly",
  "annual-possible": "Possibly yearly",
};

export const cadenceLabel = (c: SeriesCadence, singleCharge = false): string =>
  singleCharge && c === "annual-possible"
    ? "Yearly? (one charge so far)"
    : LABEL[c];

export const CONFIDENCE_LABEL = {
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;
