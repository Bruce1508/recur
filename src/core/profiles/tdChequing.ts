import type { BankProfile } from "./types";

// Written from the first masked layout dump (docs/PROGRESS.md, 2026-11-14). The dump masks names,
// so detection is by structure (the five column labels, a period, a starting balance), not by a
// bank name. Revisit when a second deposit-account format needs telling apart.
const PERIOD =
  /\b([A-Z]{3})\s*(\d{1,2})\/(\d{2})\s*(?:-|to)\s*([A-Z]{3})\s*(\d{1,2})\/(\d{2})\b/i;

export const tdChequing: BankProfile = {
  id: "td-chequing",
  kind: "deposit",
  markers: [
    /\bDescription\s+Withdrawals\s+Deposits\s+Date\s+Balance\b/i,
    PERIOD,
    /\bstarting balance\b/i,
  ],
  labels: {
    description: "description",
    withdrawals: "withdrawals",
    deposits: "deposits",
    date: "date",
    balance: "balance",
  },
  period: PERIOD,
  rowDate: /^([A-Z]{3})(\d{2})$/i,
  totalLabel: /^total$/i,
  requiredAnchors: ["printedTotals"],
};
