import { useMemo, useState } from "react";
import { BRANDS } from "../core/merchant/brands";
import { labelMap } from "../core/merchant/labels";
import { buildReadout, type ReadoutGroup } from "../core/merchant/readout";
import type { LabelFile } from "../core/merchant/types";
import { formatCents } from "../core/money";
import type { Transaction } from "../core/types";
import { Labels } from "./Labels";
import { monthsOf, sourceLabel } from "./readoutView";

const SHEET = "rounded-3xl bg-white-sheet p-5 shadow-sheet sm:p-8 print:hidden";
const H2 = "font-display text-2xl font-extrabold";
const FINE = "text-sm text-quiet-gray";
const TH = "pr-4 pb-2 text-left font-bold";
const TD = "border-t border-stone py-1.5 pr-4";

function Row({ g }: { g: ReadoutGroup }) {
  return (
    <tr>
      <td className={TD}>
        {g.name ?? "Not recognised"}
        {g.name === null && (
          <span className={`block ${FINE}`}>
            No name is guessed for these lines.
          </span>
        )}
        {g.name !== null && (
          <span className={`block ${FINE}`}>
            from {g.sources.map(sourceLabel).join(" and ")}
          </span>
        )}
        {!g.verified && (
          <span className="block text-warning-ink">
            <span aria-hidden="true">{"⚠ "}</span>
            Includes lines from a file that is not Verified
          </span>
        )}
      </td>
      <td className={TD}>{g.count}</td>
      <td className={`${TD} text-right`}>{formatCents(g.moneyOut)}</td>
      <td className="border-t border-stone py-1.5 text-right">
        {formatCents(g.moneyIn)}
      </td>
    </tr>
  );
}

export function Readout({
  transactions,
  verifiedStatementIds,
  labels,
  onLabels,
}: {
  transactions: readonly Transaction[];
  verifiedStatementIds: ReadonlySet<string>;
  labels: LabelFile;
  onLabels: (next: LabelFile) => void;
}) {
  const months = useMemo(() => monthsOf(transactions), [transactions]);
  const [chosen, setChosen] = useState<string | null>(null);
  const period =
    chosen !== null && months.includes(chosen) ? chosen : months[0];
  const readout = useMemo(
    () =>
      period === undefined
        ? undefined
        : buildReadout(
            transactions,
            { brands: BRANDS, labels: labelMap(labels) },
            verifiedStatementIds,
            period,
          ),
    [transactions, verifiedStatementIds, period, labels],
  );
  if (!readout || period === undefined) return null;
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const choices = [readout.unknown, ...readout.groups].flatMap((g) =>
    g.keys.map((key) => ({ key, shownAs: g.name })),
  );
  const rows = [
    ...readout.groups,
    ...(readout.unknown.count > 0 ? [readout.unknown] : []),
  ];

  return (
    <section className={SHEET} data-testid="readout">
      <h2 className={H2}>Where the money went</h2>
      <p className={`mt-1 ${FINE}`}>
        Totals cover every file loaded, all months together. Names come from
        your labels, a brand list and the cleaned text of each line; a line that
        none of them can name stays "Not recognised".
      </p>
      <label className="mt-3 flex items-center gap-2">
        Month for "new" and "unusual"
        <select value={period} onChange={(e) => setChosen(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <div className="overflow-x-auto">
        <table className="mt-3 text-[15px]">
          <thead>
            <tr>
              <th className={TH}>Name</th>
              <th className={TH}>Lines</th>
              <th className={`${TH} text-right`}>Money out</th>
              <th className="pb-2 text-right font-bold">Money in</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <Row key={g.name ?? "\u0000unknown"} g={g} />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className={`${TD} text-left`} scope="row">
                Total
              </th>
              <td className={TD}>{transactions.length}</td>
              <td className={`${TD} text-right`}>
                {formatCents(readout.moneyOut)}
              </td>
              <td className="border-t border-stone py-1.5 text-right">
                {formatCents(readout.moneyIn)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <h3 className="mt-5 font-bold">New in {period}</h3>
      <p data-testid="readout-new">
        {readout.newNames.length === 0
          ? "No names first seen this month."
          : readout.newNames.join(", ")}
      </p>
      <h3 className="mt-5 font-bold">Unusual in {period}</h3>
      {readout.unusual.length === 0 ? (
        <p data-testid="readout-unusual">
          Nothing outside 7.5% or $1.00 of the usual amount.
        </p>
      ) : (
        <ul data-testid="readout-unusual">
          {[...new Set(readout.unusual)].map((id) => {
            const t = byId.get(id);
            return (
              t && (
                <li
                  key={id}
                >{`${t.date} ${t.description} ${formatCents(t.amount)}`}</li>
              )
            );
          })}
        </ul>
      )}
      <p className={`mt-3 ${FINE}`}>
        "Unusual" needs at least two earlier lines with the same cleaned
        description, and compares only against the files you loaded.
      </p>
      <Labels choices={choices} labels={labels} onChange={onLabels} />
    </section>
  );
}
