import { useMemo, useState } from "react";
import { exportIcs } from "../core/exportIcs";
import { exportRecurringCsv } from "../core/exportRecurring";
import { BRANDS } from "../core/merchant/brands";
import { labelMap } from "../core/merchant/labels";
import type { LabelFile } from "../core/merchant/types";
import { formatCents } from "../core/money";
import { annualHistoryNote, detectRecurring } from "../core/recurring/detect";
import { CONFIDENCE_LABEL, cadenceLabel } from "../core/recurring/labels";
import { splitSingleCharge } from "../core/recurring/split";
import type { RecurringSeries } from "../core/recurring/types";
import type { Transaction } from "../core/types";

const SHEET = "rounded-3xl bg-white-sheet p-5 shadow-sheet sm:p-8";
const H2 = "font-display text-2xl font-extrabold";
const FINE = "text-sm text-quiet-gray";
const TH = "pr-4 pb-2 text-left font-bold";
const TD = "border-t border-stone py-1.5 pr-4 align-top";
const BTN =
  "rounded-pill bg-mint-note px-5 py-1.5 font-medium text-blurple shadow-pill";
const BTN_QUIET =
  "rounded-pill border border-ink/55 bg-white-sheet px-4 py-1 text-ink";

function Row({
  s,
  verified,
  onDismiss,
  single = false,
}: {
  s: RecurringSeries;
  verified: boolean;
  onDismiss: () => void;
  single?: boolean;
}) {
  const lines = [...new Map(s.occurrences.map((t) => [t.id, t])).values()];
  return (
    <tr data-testid="recurring-row">
      <td className={TD}>
        {s.displayName}
        {s.ambiguous && (
          <span className={`block ${FINE}`}>
            An app store or payment processor: several services can hide behind
            this name.
          </span>
        )}
        {!verified && (
          <span className="block text-warning-ink">
            <span aria-hidden="true">{"⚠ "}</span>
            Includes lines from a file that is not Verified
          </span>
        )}
        <details className="mt-1">
          <summary className={FINE}>{lines.length} charge(s)</summary>
          <ul className={FINE}>
            {lines.map((t) => (
              <li
                key={t.id}
                className="whitespace-nowrap"
              >{`${t.date} ${t.description} ${formatCents(t.amount)}`}</li>
            ))}
          </ul>
        </details>
      </td>
      <td className={TD}>{cadenceLabel(s.cadence, single)}</td>
      <td className={TD}>
        {formatCents(s.typicalAmount)}
        {s.amountKind === "variable" && (
          <span className={`block ${FINE}`}>amount varies</span>
        )}
        {s.priceChange && (
          <span className="block text-warning-ink">
            <span aria-hidden="true">{"▲ "}</span>
            Price changed from {formatCents(s.priceChange.from)} to{" "}
            {formatCents(s.priceChange.to)} on {s.priceChange.since}
          </span>
        )}
      </td>
      <td className={`${TD} text-right`}>{formatCents(s.monthlyEquivalent)}</td>
      <td className={`${TD} text-right`}>{formatCents(s.annualCost)}</td>
      <td className={TD}>{s.nextExpected}</td>
      <td className={TD}>{CONFIDENCE_LABEL[s.confidence]}</td>
      <td className="border-t border-stone py-1.5 align-top print:hidden">
        <button
          type="button"
          className={BTN_QUIET}
          aria-label={`Not recurring: ${s.displayName}`}
          onClick={onDismiss}
        >
          Not recurring
        </button>
      </td>
    </tr>
  );
}

function ColumnHeads() {
  return (
    <thead>
      <tr>
        <th className={TH}>Charge</th>
        <th className={TH}>How often</th>
        <th className={TH}>Amount</th>
        <th className={`${TH} text-right`}>Per month</th>
        <th className={`${TH} text-right`}>Per year</th>
        <th className={TH}>Next expected</th>
        <th className={TH}>Confidence</th>
        <th className="pb-2 text-left font-bold print:hidden">
          <span className="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  );
}

/**
 * The recurring charges the detector found (FR-7, FR-8, FR-14, FR-15), each with its evidence.
 * "Not recurring" hides a false positive for this visit only (FR-9): nothing is stored.
 */
export function Recurring({
  transactions,
  verifiedStatementIds,
  labels,
}: {
  transactions: readonly Transaction[];
  verifiedStatementIds: ReadonlySet<string>;
  labels: LabelFile;
}) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const series = useMemo(
    () =>
      detectRecurring(transactions, {
        brands: BRANDS,
        labels: labelMap(labels),
      }),
    [transactions, labels],
  );
  const note = useMemo(() => annualHistoryNote(transactions), [transactions]);
  const shown = useMemo(
    () => series.filter((s) => !dismissed.has(s.merchantKey)),
    [series, dismissed],
  );
  const hidden = series.filter((s) => dismissed.has(s.merchantKey));
  const { main, singles } = useMemo(() => splitSingleCharge(shown), [shown]);
  const confirmed = main.filter((s) => s.cadence !== "annual-possible");
  const perMonth = confirmed.reduce((sum, s) => sum + s.monthlyEquivalent, 0);
  const perYear = confirmed.reduce((sum, s) => sum + s.annualCost, 0);
  const stamp =
    transactions
      .map((t) => t.date)
      .sort()
      .at(-1) ?? "0001-01-01";
  const csvHref = useMemo(
    () =>
      `data:text/csv;charset=utf-8,${encodeURIComponent(exportRecurringCsv(main).toWellFormed())}`,
    [main],
  );
  const icsHref = useMemo(
    () =>
      `data:text/calendar;charset=utf-8,${encodeURIComponent(exportIcs(main, stamp).toWellFormed())}`,
    [main, stamp],
  );
  const renderRow = (s: RecurringSeries, single = false) => (
    <Row
      single={single}
      key={s.merchantKey}
      s={s}
      verified={s.occurrences.every((t) =>
        verifiedStatementIds.has(t.source.statementId),
      )}
      onDismiss={() => set(s.merchantKey, true)}
    />
  );
  const set = (key: string, hide: boolean) =>
    setDismissed((prev) => {
      const next = new Set(prev);
      if (hide) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <section className={SHEET} data-testid="recurring">
      <h2 className={H2}>Recurring charges</h2>
      <p className={`mt-1 ${FINE}`}>
        Charges that repeat on a steady schedule, found from the dates and
        amounts in the files you loaded. Open a row to see the charges behind
        it. Three or more months of history work best.
      </p>
      {note && <p className={`mt-2 ${FINE}`}>{note}</p>}
      {main.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 print:hidden">
          <a
            href={csvHref}
            download="recur-recurring-charges.csv"
            className={BTN}
          >
            Download list (CSV)
          </a>
          <a href={icsHref} download="recur-next-charges.ics" className={BTN}>
            Download calendar (.ics)
          </a>
          <button
            type="button"
            className={BTN_QUIET}
            onClick={() => window.print()}
          >
            Print this list
          </button>
        </div>
      )}
      {main.length === 0 ? (
        <p className="mt-3" data-testid="recurring-empty">
          No recurring charges found in these files.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-3 text-[15px]">
            <ColumnHeads />
            <tbody>{main.map((s) => renderRow(s))}</tbody>
            <tfoot>
              <tr>
                <th className={`${TD} text-left`} scope="row" colSpan={3}>
                  Total of the charges above, without the possible yearly ones
                </th>
                <td
                  className={`${TD} text-right`}
                  data-testid="recurring-total"
                >
                  {formatCents(perMonth)}
                </td>
                <td className={`${TD} text-right`}>{formatCents(perYear)}</td>
                <td colSpan={3} className="border-t border-stone" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {singles.length > 0 && (
        <details className="mt-4 print:hidden" data-testid="recurring-singles">
          <summary className="cursor-pointer font-bold">
            Large charges seen only once ({singles.length}) — could be yearly
          </summary>
          <p className={`mt-1 ${FINE}`}>
            One charge cannot show a schedule, so these are not in{" "}
            {main.length > 0 ? "the list above, the totals, " : "the "}
            CSV or the calendar. If one of them comes back about a year later,
            it may move up to the list.
          </p>
          <div className="overflow-x-auto">
            <table className="mt-3 text-[15px]">
              <ColumnHeads />
              <tbody>{singles.map((s) => renderRow(s, true))}</tbody>
            </table>
          </div>
        </details>
      )}
      {hidden.length > 0 && (
        <div className="mt-4 print:hidden" data-testid="recurring-hidden">
          <h3 className="font-bold">Hidden for this visit</h3>
          <ul>
            {hidden.map((s) => (
              <li
                key={s.merchantKey}
                className="flex flex-wrap items-center gap-2 py-0.5"
              >
                {s.displayName}
                <button
                  type="button"
                  className={BTN_QUIET}
                  aria-label={`Show again: ${s.displayName}`}
                  onClick={() => set(s.merchantKey, false)}
                >
                  Show again
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
