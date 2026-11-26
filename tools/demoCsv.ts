import {
  type Entry,
  generateLedger,
  type Layout,
  renderCsv,
} from "./make-synthetic";

const LAYOUT: Layout = {
  name: "demo",
  header: true,
  amount: "split",
  balance: true,
  dateFormat: "YYYY-MM-DD",
};

const OPENING = 500000;

// A yearly charge needs two payments a year apart, so the sample covers fifteen months.
const YEARLY = [
  { date: "2025-02-14", amount: -2400, description: "DOMAINHOUSE" },
  { date: "2026-02-14", amount: -2400, description: "DOMAINHOUSE" },
] as const;

/** The bundled sample file: one invented chequing account, fifteen months, every balance printed. */
export function demoCsv(): string {
  const raw = [
    ...generateLedger(1, 15, 2025, OPENING).map(
      ({ date, amount, description }) => ({ date, amount, description }),
    ),
    ...YEARLY,
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let balance = OPENING;
  const entries: Entry[] = raw.map((r) => {
    balance += r.amount;
    return { ...r, balance };
  });
  return renderCsv(entries, LAYOUT);
}
