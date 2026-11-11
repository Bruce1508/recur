import { useMemo, useRef, useState } from "react";
import { toStatement } from "../core/csv/toStatement";
import { formatCents } from "../core/money";
import { reconcile } from "../core/reconcile";
import type {
  AccountKind,
  ColumnMapping,
  DateFormat,
  Reconciliation,
} from "../core/types";
import { type ImportedFile, summarize } from "./accounts";
import { analyzeCsv } from "./analyze";

interface Entry {
  readonly id: number;
  readonly name: string;
  readonly rows: string[][];
  readonly mapping: ColumnMapping;
  readonly sample: string[][];
  /** False until the user confirms a low-confidence mapping or a lone signed amount. */
  readonly confirmed: boolean;
  readonly kind: AccountKind;
  readonly account: string;
  readonly negateSigned: boolean;
  readonly dateFormat: DateFormat;
}

// A bank CSV is kilobytes; this stops a wrong file from freezing the tab.
const MAX_BYTES = 10 * 1024 * 1024;
const ACCOUNTS = ["A", "B", "C", "D"] as const;
const DATE_FORMATS: readonly DateFormat[] = [
  "YYYY-MM-DD",
  "MM/DD/YYYY",
  "DD/MM/YYYY",
];

export function describeStatus(r: Reconciliation): string {
  switch (r.status) {
    case "verified":
      return "Verified: every balance matches the rows around it";
    case "mismatch":
      return r.firstBadRow === undefined
        ? "Mismatch: balances do not add up"
        : `Mismatch at row ${r.firstBadRow}: the balance does not follow from the amounts`;
    case "unverifiable":
      return `Cannot verify: ${r.reason}`;
  }
}

function convert(e: Entry) {
  return toStatement(
    e.rows,
    { ...e.mapping, dateFormat: e.dateFormat },
    { kind: e.kind, negateSigned: e.negateSigned },
  );
}

export function Importer() {
  const [entries, setEntries] = useState<readonly Entry[]>([]);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const nextId = useRef(1);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const added: Entry[] = [];
    const failed: string[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_BYTES) {
        failed.push(`${file.name}: cannot read this file (over 10 MB)`);
        continue;
      }
      const analysis = analyzeCsv(await file.text());
      if (analysis.status === "error") {
        failed.push(`${file.name}: cannot read this file (${analysis.reason})`);
        continue;
      }
      added.push({
        id: nextId.current++,
        name: file.name,
        rows: analysis.rows,
        mapping: analysis.mapping,
        sample: analysis.status === "confirm" ? analysis.sample : [],
        confirmed: analysis.status === "ready",
        kind: "deposit",
        account: "A",
        negateSigned: false,
        dateFormat: analysis.mapping.dateFormat,
      });
    }
    setEntries((prev) => [...prev, ...added]);
    setErrors([...new Set(failed)]);
  }

  const update = (id: number, patch: Partial<Entry>) =>
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );

  const converted = useMemo(
    () =>
      entries.map((e) => {
        const result = convert(e);
        return {
          entry: e,
          result,
          status: result.ok ? reconcile(result.statement) : undefined,
        };
      }),
    [entries],
  );
  const summary = useMemo(() => {
    const files: ImportedFile[] = [];
    for (const { entry, result } of converted) {
      if (entry.confirmed && result.ok)
        files.push({
          name: entry.name,
          account: entry.account,
          statement: result.statement,
        });
    }
    return summarize(files);
  }, [converted]);

  const pending = entries.filter((e) => !e.confirmed);

  return (
    <div className="mt-6 space-y-6">
      <label
        className="block rounded border-2 border-dashed p-6"
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={(ev) => {
          ev.preventDefault();
          void addFiles(ev.dataTransfer.files);
        }}
      >
        <span className="block">
          Choose one or more CSV files (or drop them here)
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          data-testid="file-input"
          onChange={(ev) => {
            void addFiles(ev.target.files);
            ev.target.value = "";
          }}
        />
      </label>

      {errors.map((m) => (
        <p key={m} role="alert" className="text-red-700">
          {m}
        </p>
      ))}

      {pending.map((e) => (
        <section key={e.id} className="rounded border p-4">
          <h2 className="font-semibold">Confirm columns: {e.name}</h2>
          <p className="text-sm">
            Check these first rows, then confirm. Nothing is converted until you
            do.
          </p>
          <table className="my-2 text-sm">
            <tbody>
              {e.sample.map((row, r) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: sample rows may be identical and are static
                <tr key={r}>
                  {row.map((cell, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: cells have no id; the sample is static
                    <td key={i} className="pr-4">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <label className="mr-4">
            Date format{" "}
            <select
              value={e.dateFormat}
              onChange={(ev) =>
                update(e.id, { dateFormat: ev.target.value as DateFormat })
              }
            >
              {DATE_FORMATS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          {"signed" in e.mapping.amount && (
            <label className="mr-4">
              <input
                type="checkbox"
                checked={e.negateSigned}
                onChange={(ev) =>
                  update(e.id, { negateSigned: ev.target.checked })
                }
              />{" "}
              Purchases are positive in this file (flip the sign)
            </label>
          )}
          <button
            type="button"
            className="rounded border px-3"
            onClick={() => update(e.id, { confirmed: true })}
          >
            Confirm
          </button>{" "}
          <button
            type="button"
            className="rounded border px-3"
            onClick={() =>
              setEntries((prev) => prev.filter((x) => x.id !== e.id))
            }
          >
            Remove file
          </button>
        </section>
      ))}

      {entries.some((e) => e.confirmed) && (
        <>
          <section>
            <h2 className="font-semibold">Files</h2>
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="pr-4 text-left">File</th>
                  <th className="pr-4 text-left">Account</th>
                  <th className="pr-4 text-left">Type</th>
                  <th className="pr-4 text-left">Rows</th>
                  <th className="text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {converted
                  .filter(({ entry }) => entry.confirmed)
                  .map(({ entry, result, status }) => (
                    <tr key={entry.id}>
                      <td className="pr-4">{entry.name}</td>
                      <td className="pr-4">
                        <select
                          aria-label={`Account for ${entry.name}`}
                          value={entry.account}
                          onChange={(ev) =>
                            update(entry.id, { account: ev.target.value })
                          }
                        >
                          {ACCOUNTS.map((a) => (
                            <option key={a}>{a}</option>
                          ))}
                        </select>
                      </td>
                      <td className="pr-4">
                        <select
                          aria-label={`Account type for ${entry.name}`}
                          value={entry.kind}
                          onChange={(ev) =>
                            update(entry.id, {
                              kind: ev.target.value as AccountKind,
                            })
                          }
                        >
                          <option value="deposit">Chequing or savings</option>
                          <option value="credit">Credit card</option>
                        </select>
                      </td>
                      {result.ok ? (
                        <>
                          <td className="pr-4">
                            {result.statement.transactions.length}
                          </td>
                          <td>
                            {status && describeStatus(status)}
                            {result.statement.warnings.map((w) => (
                              <div key={w} className="text-amber-700">
                                {w}
                              </div>
                            ))}
                          </td>
                        </>
                      ) : (
                        <td colSpan={2} className="text-red-700">
                          Cannot read this file: {result.reason}
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="mt-2 text-sm">
              Files from the same account are merged and de-duplicated. Put each
              account's files under its own letter.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">
              Transactions ({summary.transactions.length})
            </h2>
            <p className="text-sm" data-testid="ledger-notes">
              {summary.duplicatesRemoved} duplicate row(s) removed.
              {summary.accounts
                .filter((a) => a.missingMonths.length > 0)
                .map(
                  (a) =>
                    ` Account ${a.id} has no data for ${a.missingMonths.join(", ")}.`,
                )
                .join("")}
            </p>
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="pr-4 text-left">Date</th>
                  <th className="pr-4 text-left">Description</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {summary.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="pr-4">{t.date}</td>
                    <td className="pr-4">{t.description}</td>
                    <td className="text-right">{formatCents(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <footer className="text-sm">
        <details>
          <summary>How to verify nothing is uploaded</summary>
          Open your browser's network tab and drop a file: no request is made.
          Or load this page, turn off Wi-Fi, then drop a file.
        </details>
      </footer>
    </div>
  );
}
