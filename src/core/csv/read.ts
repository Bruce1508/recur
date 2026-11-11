import Papa from "papaparse";

export type CsvRead =
  | { ok: true; rows: string[][] }
  | { ok: false; reason: string };

/**
 * CSV text -> rows of strings (stage 1, first step).
 *
 * Cells stay strings: no number or date conversion here. A file with no header row comes back
 * as data; deciding what is a header is mapColumns' job. The delimiter (comma, tab, semicolon,
 * pipe) is detected by PapaParse. A malformed quote fails closed: PapaParse would otherwise fold
 * the rest of the file into one cell and drop transactions without a word.
 */
export function readCsv(text: string): CsvRead {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const result = Papa.parse<string[]>(body, { skipEmptyLines: "greedy" });

  const quoteError = result.errors.find((e) => e.type === "Quotes");
  if (quoteError) {
    const where =
      quoteError.row === undefined ? "" : ` near row ${quoteError.row + 1}`;
    return { ok: false, reason: `Malformed quoting${where}` };
  }
  return { ok: true, rows: result.data };
}
