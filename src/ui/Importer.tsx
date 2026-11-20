import { useMemo, useRef, useState } from "react";
import type { Boundary } from "../core/chain";
import { toStatement } from "../core/csv/toStatement";
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
    : `Not checked: the ${open.join(" and the ")} of the file (no adjacent statement of this account to check it against)`;
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
      return `${files}: closing balance ${formatCents(o.expected)}, next opening ${formatCents(o.actual)}; a statement may be missing between them`;
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
    <div className="space-x-4">
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

  const nameOf = (id: string) =>
    converted.find(({ result }) => result.ok && result.statement.id === id)
      ?.entry.name ?? id;

  const pending = entries.filter(
    (e): e is CsvEntry => e.input === "csv" && !e.confirmed,
  );

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
          Choose one or more PDF statements or CSV files (or drop them here)
        </span>
        <input
          type="file"
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
            <thead>
              <tr>
                {columnRoles(
                  applyChoices(e.mapping, e),
                  e.sample[0]?.length ?? 0,
                ).map((role, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                  <th key={i} className="pr-4 text-left font-semibold">
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
                    <td key={i} className="pr-4">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <Controls e={e} update={update} />
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
            onClick={() => remove(e.id)}
          >
            Remove file
          </button>
        </section>
      ))}

      {entries.some(isReady) && (
        <>
          <section>
            <h2 className="font-semibold">Files</h2>
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="pr-4 text-left">File</th>
                  <th className="pr-4 text-left">Account</th>
                  <th className="pr-4 text-left">Rows</th>
                  <th className="pr-4 text-left">Status</th>
                  <th className="text-left">Adjust</th>
                </tr>
              </thead>
              <tbody>
                {converted
                  .filter(({ entry }) => isReady(entry))
                  .map(({ entry, result, status }) => (
                    <tr key={entry.id}>
                      <td className="pr-4">{entry.name}</td>
                      <td className="pr-4">
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
                          <td className="pr-4">
                            {result.statement.transactions.length}
                          </td>
                          <td className="pr-4">
                            {status && describeStatus(status)}
                            {entry.input === "csv" &&
                              status?.status === "verified" && (
                                <div className="text-amber-700">
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
                              <div key={w} className="text-amber-700">
                                {w}
                              </div>
                            ))}
                          </td>
                        </>
                      ) : (
                        <td colSpan={2} className="pr-4 text-red-700">
                          Cannot read this file: {result.reason}
                        </td>
                      )}
                      <td>
                        {entry.input === "csv" && (
                          <Controls e={entry} update={update} />
                        )}
                        <button
                          type="button"
                          className="rounded border px-3"
                          onClick={() => remove(entry.id)}
                        >
                          Remove file
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="mt-2 text-sm">
              Files under one letter are merged as one account and
              de-duplicated: a Verified PDF replaces the CSV rows inside its
              period. PDFs start under A and CSV files under B; move a CSV to
              its PDF's letter only if both are the same account.
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
            <ul className="text-sm" data-testid="chain-notes">
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
