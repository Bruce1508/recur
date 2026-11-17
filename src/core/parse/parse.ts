import { hash53 } from "../csv/toStatement";
import { parseMoney } from "../money";
import { parseDate } from "../plainDate";
import type { BankProfile } from "../profiles/types";
import type {
  Cents,
  Line,
  LineDocument,
  ParsedStatement,
  PlainDate,
  RawItem,
  Transaction,
} from "../types";

export type ParseResult =
  | { ok: true; statement: ParsedStatement }
  | { ok: false; reason: string };

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const AMOUNT = /^-?\$?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/;
// Right edges inside one amount column may differ by at most this much (ADR-020).
const RIGHT_EDGE_TOLERANCE = 1;

type AmountColumn = "withdrawals" | "deposits" | "balance";
type Label = { name: keyof BankProfile["labels"]; x: number };

const right = (i: RawItem) => i.x + i.w;
const monthNumber = (m: string) => MONTHS.indexOf(m.toUpperCase()) + 1;

function readPeriod(
  doc: LineDocument,
  profile: BankProfile,
): { start: PlainDate; end: PlainDate } | null {
  for (const line of doc.lines) {
    const m = profile.period.exec(line.text);
    if (!m) continue;
    const date = (mon = "", day = "", yy = "") =>
      parseDate(
        `${2000 + Number(yy)}-${String(monthNumber(mon)).padStart(2, "0")}-${day.padStart(2, "0")}`,
        "YYYY-MM-DD",
      );
    const start = date(m[1], m[2], m[3]);
    const end = date(m[4], m[5], m[6]);
    if (start && end && start <= end) return { start, end };
  }
  return null;
}

/** The header line of a page: one item per label, matched by text. */
function findHeader(
  lines: readonly Line[],
  profile: BankProfile,
): { index: number; labels: Label[] } | null {
  const names = Object.keys(profile.labels) as Label["name"][];
  for (const [index, line] of lines.entries()) {
    const labels: Label[] = [];
    for (const name of names) {
      const item = line.items.find(
        (i) => i.str.trim().toLowerCase() === profile.labels[name],
      );
      if (item) labels.push({ name, x: item.x });
    }
    if (labels.length === names.length) return { index, labels };
  }
  return null;
}

/**
 * Parse a statement of a known format (ADR-020). Columns come from the header labels on each page;
 * every amount belongs to the span that contains its right edge. Fails closed: a page that cannot
 * be read adds a warning and no rows, and `reconcile` gives `unverifiable` for any warning.
 */
export function parse(doc: LineDocument, profile: BankProfile): ParseResult {
  const period = readPeriod(doc, profile);
  if (!period)
    return { ok: false, reason: "the statement period was not found" };

  const id = `pdf-${hash53(doc.lines.map((l) => l.text).join("\n"))}`;
  const warnings: string[] = [];
  const draft: { tx: Transaction; description: string }[] = [];
  let opening: Cents | undefined;
  let totals: { withdrawals: Cents; deposits: Cents } | undefined;
  let totalRows = 0;
  let previousDate: PlainDate | undefined;

  const dateOf = (text: string): PlainDate | null => {
    const m = profile.rowDate.exec(text);
    const month = monthNumber(m?.[1] ?? "");
    if (!m || month === 0) return null;
    for (const year of new Set([
      Number(period.start.slice(0, 4)),
      Number(period.end.slice(0, 4)),
    ])) {
      const d = parseDate(
        `${year}-${String(month).padStart(2, "0")}-${(m[2] ?? "").padStart(2, "0")}`,
        "YYYY-MM-DD",
      );
      if (d && d >= period.start && d <= period.end) return d;
    }
    return null;
  };

  const pageNumbers = [...new Set(doc.lines.map((l) => l.page))];
  for (const page of pageNumbers) {
    const lines = doc.lines.filter((l) => l.page === page);
    const header = findHeader(lines, profile);
    if (!header) {
      if (lines.some((l) => l.items.some((i) => profile.rowDate.test(i.str)))) {
        warnings.push(`page ${page} has dated rows but no table header`);
      }
      continue;
    }

    // Spans: each amount label's left edge to the next label's left edge.
    const sorted = [...header.labels].sort((a, b) => a.x - b.x);
    const firstAmountX =
      sorted.find((l) => l.name !== "description" && l.name !== "date")?.x ??
      Number.POSITIVE_INFINITY;
    const columnOf = (item: RawItem): AmountColumn | null => {
      const edge = right(item);
      let owner: Label | undefined;
      for (const l of sorted) if (l.x <= edge) owner = l;
      return owner?.name === "withdrawals" ||
        owner?.name === "deposits" ||
        owner?.name === "balance"
        ? owner.name
        : null;
    };
    const isAmount = (i: RawItem) =>
      AMOUNT.test(i.str.trim()) && right(i) >= firstAmountX;

    // The body runs to the total row, or else to the last line with an amount in a column.
    const after = lines.slice(header.index + 1);
    const totalAt = after.findIndex((l) =>
      profile.totalLabel.test(l.items[0]?.str.trim() ?? ""),
    );
    let end = totalAt;
    if (end < 0) {
      end = 0;
      after.forEach((l, k) => {
        if (l.items.some((i) => isAmount(i))) end = k + 1;
      });
    }
    const extraTotals = after
      .slice(totalAt < 0 ? after.length : totalAt + 1)
      .filter((l) => profile.totalLabel.test(l.items[0]?.str.trim() ?? ""));
    totalRows += extraTotals.length;

    const body = after.slice(0, end);
    const totalLine = totalAt >= 0 ? after[totalAt] : undefined;
    const edges = new Map<AmountColumn, number[]>();
    for (const l of [...body, ...(totalLine ? [totalLine] : [])]) {
      for (const i of l.items) {
        const col = isAmount(i) ? columnOf(i) : null;
        if (col) edges.set(col, [...(edges.get(col) ?? []), right(i)]);
      }
    }
    const ragged = [...edges.values()].some(
      (e) => Math.max(...e) - Math.min(...e) > RIGHT_EDGE_TOLERANCE,
    );
    if (ragged) {
      warnings.push(`page ${page}: an amount column is not right-aligned`);
      continue;
    }

    if (totalLine) {
      totalRows++;
      const col = (c: AmountColumn) =>
        totalLine.items.filter((i) => isAmount(i) && columnOf(i) === c);
      const [w, d] = [col("withdrawals"), col("deposits")];
      const wc = w.length === 1 ? parseMoney(w[0]?.str ?? "") : null;
      const dc = d.length === 1 ? parseMoney(d[0]?.str ?? "") : null;
      if (wc !== null && dc !== null)
        totals = { withdrawals: wc, deposits: dc };
      else warnings.push(`page ${page}: the total row could not be read`);
    }

    for (const line of body) {
      const lineIndex = lines.indexOf(line);
      const by = (c: AmountColumn) =>
        line.items.filter((i) => isAmount(i) && columnOf(i) === c);
      const [w, d, b] = [by("withdrawals"), by("deposits"), by("balance")];
      // Anything in the amount area that is not a placed amount or a row date (a trailing-minus
      // amount, a stray label) is text the parser cannot place: warn rather than ignore it.
      const stray = line.items.some(
        (i) =>
          i.str.trim() !== "" &&
          (isAmount(i)
            ? columnOf(i) === null
            : i.x >= firstAmountX && !profile.rowDate.test(i.str.trim())),
      );
      const description = line.items
        .filter((i) => !isAmount(i) && i.x < firstAmountX)
        .map((i) => i.str.trim())
        .filter((s) => s !== "")
        .join(" ");
      const dateText = line.items.find((i) =>
        profile.rowDate.test(i.str.trim()),
      );

      if (
        stray ||
        w.length > 1 ||
        d.length > 1 ||
        b.length > 1 ||
        (w[0] && d[0])
      ) {
        warnings.push(
          `page ${page}: a row has amounts that could not be placed`,
        );
        continue;
      }
      const balance = b[0] ? parseMoney(b[0].str) : null;
      const moved = w[0] ?? d[0];
      if (!moved && dateText && balance === null && description !== "") {
        warnings.push(`page ${page}: a dated row has no amount`);
        continue;
      }
      if (!moved) {
        if (balance !== null && draft.length === 0 && opening === undefined) {
          opening = balance;
        } else if (balance === null && description !== "" && !dateText) {
          const prev = draft[draft.length - 1];
          if (prev) prev.description += ` ${description}`;
        }
        continue;
      }

      const cents = parseMoney(moved.str);
      const date = dateText ? dateOf(dateText.str.trim()) : previousDate;
      if (cents === null || !date) {
        warnings.push(`page ${page}: a row has no readable date or amount`);
        continue;
      }
      previousDate = date;
      draft.push({
        description,
        tx: {
          id: `${id}:${page}:${lineIndex}`,
          date,
          description,
          amount: w[0] ? -cents : cents,
          ...(balance !== null ? { balanceAfter: balance } : {}),
          source: { statementId: id, input: "pdf", page, lineIndex },
        },
      });
    }
  }

  if (totalRows > 1) {
    warnings.push("the statement has more than one total row");
    totals = undefined;
  }
  if (draft.length === 0) {
    return { ok: false, reason: "no transactions were read" };
  }
  return {
    ok: true,
    statement: {
      id,
      input: "pdf",
      bankId: profile.id,
      kind: profile.kind,
      period,
      ...(opening !== undefined ? { openingBalance: opening } : {}),
      ...(totals ? { printedTotals: totals } : {}),
      requiredAnchors: profile.requiredAnchors,
      transactions: draft.map((d) => ({ ...d.tx, description: d.description })),
      warnings,
    },
  };
}
