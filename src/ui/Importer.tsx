import { useMemo, useRef, useState } from "react";
import type { Boundary } from "../core/chain";
import { toStatement } from "../core/csv/toStatement";
import { exportLedgerCsv } from "../core/exportCsv";
import { formatCents } from "../core/money";
import { reconcile } from "../core/reconcile";
import type {
  AccountKind,
  ColumnMapping,
  DateFormat,
  ParsedStatement,
  Reconciliation,
} from "../core/types";
import { type ImportedFile, summarize } from "./accounts";
import { analyzeCsv, applyChoices, columnRoles } from "./analyze";
import { readPdf } from "./readPdf";

interface PdfEntry {
  readonly input: "pdf";
  readonly id: number;
  readonly name: string;
  readonly account: string;
  readonly statement: ParsedStatement;
}

interface CsvEntry {
  readonly input: "csv";
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
  readonly swapDebitCredit: boolean;
  readonly dateFormat: DateFormat;
}

type Entry = CsvEntry | PdfEntry;
type Update = (id: number, patch: Partial<Omit<CsvEntry, "input">>) => void;

// A bank CSV or statement PDF is well under this; it stops a wrong file from freezing the tab.
const MAX_BYTES = 10 * 1024 * 1024;
const ACCOUNTS = ["A", "B", "C", "D"] as const;
// A verified PDF replaces the CSV rows of its account inside its period, so a CSV joins a PDF's
// account only when the user puts it there.
const PDF_ACCOUNT = "A";
const CSV_ACCOUNT = "B";
const DATE_FORMATS: readonly DateFormat[] = [
  "YYYY-MM-DD",
  "MM/DD/YYYY",
  "DD/MM/YYYY",
];

const VERIFIED = {
  "running-balance": "Verified: every balance matches the rows around it",
  checkpoints:
    "Verified: every printed balance and the statement totals follow from the amounts",
  totals: "Verified: the amounts add up to the printed totals",
} as const;

const SHEET = "rounded-3xl bg-white-sheet p-5 shadow-sheet sm:p-8";
const H2 = "font-display text-2xl font-extrabold";
const BTN =
  "rounded-pill bg-mint-note px-5 py-1.5 font-medium text-blurple shadow-pill";
const BTN_QUIET =
  "rounded-pill border border-ink/55 bg-white-sheet px-4 py-1 text-ink";
const FINE = "text-sm text-quiet-gray";
const TH = "pr-4 pb-2 text-left font-bold";
const TD = "border-t border-stone py-1.5 pr-4";

const BADGE = {
  verified: { mark: "\u2713", tone: "bg-mint-note" },
  mismatch: { mark: "\u26A0", tone: "bg-salmon-wash" },
  unverifiable: { mark: "\u2139", tone: "bg-canary-note" },
} as const;

function StatusBadge({ r }: { r: Reconciliation }) {
  const b = BADGE[r.status];
  return (
    <span
      className={`inline-flex items-start gap-2 rounded-2xl px-3 py-1 text-ink ${b.tone}`}
    >
      <span aria-hidden="true" className="font-bold">
        {b.mark}
      </span>
      <span>{describeStatus(r)}</span>
    </span>
  );
}

const isReady = (e: Entry) => e.input === "pdf" || e.confirmed;

export function describeStatus(r: Reconciliation): string {
  switch (r.status) {
    case "verified":
      return VERIFIED[r.method];
    case "mismatch":
      if (r.firstBadSource?.input === "pdf")
        return `Mismatch on page ${r.firstBadSource.page}, line ${r.firstBadSource.lineIndex + 1}: the printed balance does not follow from the amounts`;
      return r.firstBadRow === undefined
        ? "Mismatch: the amounts do not add up to what the file prints"
        : `Mismatch at row ${r.firstBadRow}: the balance does not follow from the amounts`;
    case "unverifiable":
      return `Cannot verify: ${r.reason}`;
  }
}

export function describeEnds(ends: { start: boolean; end: boolean }): string {
  const open = [ends.start ? "" : "start", ends.end ? "" : "end"].filter(
    Boolean,
  );
  return open.length === 0
    ? ""
    : `Not checked: the ${open.join(" and the ")} of the file`;
}

export function describeBoundary(
  b: Boundary,
  name: (id: string) => string,
): string {
  const files = `${name(b.before)} then ${name(b.after)}`;
  const o = b.outcome;
  switch (o.status) {
    case "chained":
      return "";
    case "gap":
      return `${files}: closing balance ${formatCents(o.expected)}, next opening ${formatCents(o.actual)}; a statement between them, or the first or last rows of either file, may be missing`;
    case "mismatch":
      return `${files}: closing balance ${formatCents(o.expected)}, next opening ${formatCents(o.actual)}; a row at the end of one file or the start of the other is missing or wrong`;
    case "unchainable":
      return `${files}: cannot be checked against each other (${o.reason})`;
  }
}

function convert(e: CsvEntry) {
  return toStatement(e.rows, applyChoices(e.mapping, e), {
    kind: e.kind,
    negateSigned: e.negateSigned,
  });
}

function Controls({ e, update }: { e: CsvEntry; update: Update }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 py-2">
      <label>
        Account type{" "}
        <select
          aria-label={`Account type for ${e.name}`}
          value={e.kind}
          onChange={(ev) =>
            update(e.id, { kind: ev.target.value as AccountKind })
          }
        >
          <option value="deposit">Chequing or savings</option>
          <option value="credit">Credit card</option>
        </select>
      </label>
      <label>
        Date format{" "}
        <select
          aria-label={`Date format for ${e.name}`}
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
      {"signed" in e.mapping.amount ? (
        <label>
          <input
            type="checkbox"
            checked={e.negateSigned}
            onChange={(ev) => update(e.id, { negateSigned: ev.target.checked })}
          />{" "}
          Purchases are positive in this file (flip the sign)
        </label>
      ) : (
        <label>
          <input
            type="checkbox"
            checked={e.swapDebitCredit}
            onChange={(ev) =>
              update(e.id, { swapDebitCredit: ev.target.checked })
            }
          />{" "}
          Swap the debit and credit columns
        </label>
      )}
    </div>
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
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const read = await file
          .arrayBuffer()
          .then((b) => readPdf(new Uint8Array(b)))
          .catch(() => ({
            ok: false as const,
            reason: "the PDF reader stopped with an error",
          }));
        if (!read.ok) {
          failed.push(`${file.name}: cannot read this file (${read.reason})`);
          continue;
        }
        added.push({
          input: "pdf",
          id: nextId.current++,
          name: file.name,
          account: PDF_ACCOUNT,
          statement: read.statement,
        });
        continue;
      }
      const text = await file.text().catch(() => null);
      if (text === null) {
        failed.push(
          `${file.name}: cannot read this file (it could not be opened)`,
        );
        continue;
      }
      const analysis = analyzeCsv(text);
      if (analysis.status === "error") {
        failed.push(`${file.name}: cannot read this file (${analysis.reason})`);
        continue;
      }
      added.push({
        input: "csv",
        id: nextId.current++,
        name: file.name,
        rows: analysis.rows,
        mapping: analysis.mapping,
        sample: analysis.status === "confirm" ? analysis.sample : [],
        confirmed: analysis.status === "ready",
        kind: "deposit",
        account: CSV_ACCOUNT,
        negateSigned: false,
        swapDebitCredit: false,
        dateFormat: analysis.mapping.dateFormat,
      });
    }
    setEntries((prev) => [...prev, ...added]);
    setErrors([...new Set(failed)]);
  }

  const update: Update = (id, patch) =>
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id && e.input === "csv" ? { ...e, ...patch } : e,
      ),
    );
  const setAccount = (id: number, account: string) =>
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, account } : e)),
    );
  const remove = (id: number) =>
    setEntries((prev) => prev.filter((x) => x.id !== id));

  const converted = useMemo(
    () =>
      entries.map((e) => {
        const result =
          e.input === "csv"
            ? convert(e)
            : { ok: true as const, statement: e.statement };
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
      if (isReady(entry) && result.ok)
        files.push({
          name: entry.name,
          account: entry.account,
          statement: result.statement,
        });
    }
    return summarize(files);
  }, [converted]);
  // A data: URL, not a blob: one, so there is no object URL to revoke and nothing that looks like a request.
  const csvHref = useMemo(
    () =>
      `data:text/csv;charset=utf-8,${encodeURIComponent(exportLedgerCsv(summary.rows))}`,
    [summary],
  );

  const nameOf = (id: string) =>
    converted.find(({ result }) => result.ok && result.statement.id === id)
      ?.entry.name ?? id;

  const pending = entries.filter(
    (e): e is CsvEntry => e.input === "csv" && !e.confirmed,
  );

  return (
    <div className="mt-8 space-y-6">
      <label
        className={`block ${SHEET} border-2 border-dashed border-ink/55`}
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={(ev) => {
          ev.preventDefault();
          void addFiles(ev.dataTransfer.files);
        }}
      >
        <span className="block font-hand text-xl">
          Choose one or more PDF statements or CSV files (or drop them here)
        </span>
        <input
          type="file"
          className="mt-3 block w-full"
          accept=".pdf,application/pdf,.csv,text/csv"
          multiple
          data-testid="file-input"
          onChange={(ev) => {
            void addFiles(ev.target.files);
            ev.target.value = "";
          }}
        />
      </label>

      {errors.map((m) => (
        <p
          key={m}
          role="alert"
          className="flex gap-2 rounded-2xl bg-salmon-wash px-4 py-2 text-ink"
        >
          <span aria-hidden="true" className="font-bold">
            {"\u26A0"}
          </span>
          <span>{m}</span>
        </p>
      ))}

      {pending.map((e) => (
        <section key={e.id} className={SHEET}>
          <h2 className={H2}>Confirm columns: {e.name}</h2>
          <p className={FINE}>
            Check these first rows, then confirm. Nothing is converted until you
            do.
          </p>
          <div className="overflow-x-auto">
            <table className="my-3 text-[15px]">
              <thead>
                <tr>
                  {columnRoles(
                    applyChoices(e.mapping, e),
                    e.sample[0]?.length ?? 0,
                  ).map((role, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                    <th key={i} className={TH}>
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {e.sample.map((row, r) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: sample rows may be identical and are static
                  <tr key={r}>
                    {row.map((cell, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: cells have no id; the sample is static
                      <td key={i} className={TD}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Controls e={e} update={update} />
          <button
            type="button"
            className={BTN}
            onClick={() => update(e.id, { confirmed: true })}
          >
            Confirm
          </button>{" "}
          <button
            type="button"
            className={BTN_QUIET}
            onClick={() => remove(e.id)}
          >
            Remove file
          </button>
        </section>
      ))}

      {entries.some(isReady) && (
        <>
          <section className={SHEET}>
            <h2 className={H2}>Files</h2>
            <div className="overflow-x-auto">
              <table className="text-[15px]">
                <thead>
                  <tr>
                    <th className={TH}>File</th>
                    <th className={TH}>Account</th>
                    <th className={TH}>Rows</th>
                    <th className={TH}>Status</th>
                    <th className="pb-2 text-left font-bold">Adjust</th>
                  </tr>
                </thead>
                <tbody>
                  {converted
                    .filter(({ entry }) => isReady(entry))
                    .map(({ entry, result, status }) => (
                      <tr key={entry.id}>
                        <td className={TD}>{entry.name}</td>
                        <td className={TD}>
                          <select
                            aria-label={`Account for ${entry.name}`}
                            value={entry.account}
                            onChange={(ev) =>
                              setAccount(entry.id, ev.target.value)
                            }
                          >
                            {ACCOUNTS.map((a) => (
                              <option key={a}>{a}</option>
                            ))}
                          </select>
                        </td>
                        {result.ok ? (
                          <>
                            <td className={TD}>
                              {result.statement.transactions.length}
                            </td>
                            <td className={TD}>
                              {status && <StatusBadge r={status} />}
                              {entry.input === "csv" &&
                                status?.status === "verified" && (
                                  <div className="mt-1 text-warning-ink">
                                    {describeEnds(
                                      summary.accounts.find(
                                        (a) => a.id === entry.account,
                                      )?.chain.ends[result.statement.id] ?? {
                                        start: false,
                                        end: false,
                                      },
                                    )}
                                  </div>
                                )}
                              {result.statement.warnings.map((w) => (
                                <div key={w} className="mt-1 text-warning-ink">
                                  {w}
                                </div>
                              ))}
                            </td>
                          </>
                        ) : (
                          <td colSpan={2} className={`${TD} text-ink`}>
                            <span aria-hidden="true" className="font-bold">
                              {"\u26A0"}{" "}
                            </span>
                            Cannot read this file: {result.reason}
                          </td>
                        )}
                        <td className="border-t border-stone py-1.5">
                          {entry.input === "csv" && (
                            <Controls e={entry} update={update} />
                          )}
                          <button
                            type="button"
                            className={BTN_QUIET}
                            onClick={() => remove(entry.id)}
                          >
                            Remove file
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className={`mt-3 ${FINE}`}>
              Files under one letter are merged as one account and
              de-duplicated: a Verified PDF replaces the CSV rows inside its
              period. PDFs start under A and CSV files under B; move a CSV to
              its PDF's letter only if both are the same account.
            </p>
          </section>

          <section className={SHEET}>
            <h2 className={H2}>Transactions ({summary.rows.length})</h2>
            {summary.rows.length > 0 && (
              <div className="my-3 flex flex-wrap items-center gap-3">
                <a
                  href={csvHref}
                  download="recur-transactions.csv"
                  className={BTN}
                >
                  Download transactions (CSV)
                </a>
                <p className={`${FINE} max-w-prose`}>
                  Amounts are plain numbers. A description that a spreadsheet
                  would run as a formula starts with an apostrophe.
                </p>
              </div>
            )}
            <p className={`mt-2 ${FINE}`} data-testid="ledger-notes">
              {summary.duplicatesRemoved} duplicate row(s) removed.
              {summary.accounts
                .filter((a) => a.missingMonths.length > 0)
                .map(
                  (a) =>
                    ` Account ${a.id} has no data for ${a.missingMonths.join(", ")}.`,
                )
                .join("")}
            </p>
            <ul className={FINE} data-testid="chain-notes">
              {summary.accounts.flatMap((a) =>
                a.chain.boundaries
                  .filter((b) => b.outcome.status !== "chained")
                  .map((b) => (
                    <li key={`${a.id}-${b.before}-${b.after}`}>
                      Account {a.id}: {describeBoundary(b, nameOf)}
                    </li>
                  )),
              )}
            </ul>
            <div className="overflow-x-auto">
              <table className="mt-3 text-[15px]">
                <thead>
                  <tr>
                    <th className={TH}>Date</th>
                    <th className={TH}>Description</th>
                    <th className="pb-2 text-right font-bold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map(({ transaction: t }) => (
                    <tr key={t.id}>
                      <td className={TD}>{t.date}</td>
                      <td className={TD}>{t.description}</td>
                      <td className="border-t border-stone py-1.5 text-right">
                        {formatCents(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <footer className={FINE}>
        <details>
          <summary>How to verify nothing is uploaded</summary>
          Open your browser's network tab and drop a file: no request is made.
          Or load this page, turn off Wi-Fi, then drop a file.
        </details>
      </footer>
    </div>
  );
}
