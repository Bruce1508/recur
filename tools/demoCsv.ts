import { generateLedger, type Layout, renderCsv } from "./make-synthetic";

const LAYOUT: Layout = {
  name: "demo",
  header: true,
  amount: "split",
  balance: true,
  dateFormat: "YYYY-MM-DD",
};

/** The bundled sample file: one invented chequing account, twelve months, every balance printed. */
export const demoCsv = (): string =>
  renderCsv(generateLedger(1, 12, 2025), LAYOUT);
