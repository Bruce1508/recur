import { mapColumns } from "../core/csv/mapColumns";
import { readCsv } from "../core/csv/read";
import type { ColumnMapping } from "../core/types";

export type Analysis =
  | { status: "error"; reason: string }
  | {
      status: "ready";
      rows: string[][];
      mapping: ColumnMapping;
    }
  | {
      status: "confirm";
      rows: string[][];
      mapping: ColumnMapping;
      /** First data rows as read, so the user can check dates and the sign of amounts. */
      sample: string[][];
    };

/**
 * CSV text -> what the UI must do next. A mapping goes to the user when it is low confidence, or
 * when a lone signed amount column has no balance column to prove its sign (ColumnMapping has no
 * sign field, and toStatement does not check confidence).
 */
export function analyzeCsv(text: string): Analysis {
  const read = readCsv(text);
  if (!read.ok) return { status: "error", reason: read.reason };
  const mapped = mapColumns(read.rows);
  if (!mapped.ok) return { status: "error", reason: mapped.reason };
  const { mapping } = mapped;
  const loneSignedUnproven =
    "signed" in mapping.amount && mapping.balance === undefined;
  if (mapping.confidence === "low" || loneSignedUnproven) {
    const first = mapping.hasHeader ? 1 : 0;
    return {
      status: "confirm",
      rows: read.rows,
      mapping,
      sample: read.rows.slice(first, first + 3),
    };
  }
  return { status: "ready", rows: read.rows, mapping };
}
