// The only file that imports pdfjs-dist (enforced by the import-boundary lint rule).
// Uses the legacy build, which runs in Node as well as the browser. The browser build, the
// self-hosted worker and the CSP check are M5 work that comes with the UI.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { RawDocument, RawItem, RawPage } from "../core/types";

export type ExtractResult =
  | { ok: true; doc: RawDocument }
  | { ok: false; reason: string };

const round = (n: number) => Math.round(n * 100) / 100;
const text = (v: unknown) =>
  typeof v === "string" && v !== "" ? v : undefined;

/**
 * PDF bytes to positioned text. Fails closed: a damaged, encrypted or non-PDF file gives a reason
 * made of the error's class name only, because a library message can quote the file.
 */
export async function extractPdf(data: Uint8Array): Promise<ExtractResult> {
  // pdf.js takes ownership of the buffer it is given, so hand it a copy.
  const task = getDocument({
    data: data.slice(),
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    const info = ((await pdf.getMetadata()).info ?? {}) as Record<
      string,
      unknown
    >;
    const pages: RawPage[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const { width, height } = page.getViewport({ scale: 1 });
      const items: RawItem[] = [];
      for (const item of (await page.getTextContent()).items) {
        if (!("str" in item) || item.str === "") continue;
        const [, , , , e, f] = item.transform as number[];
        items.push({
          str: item.str,
          x: round(e ?? 0),
          y: round(height - (f ?? 0)),
          w: round(item.width),
          h: round(item.height),
          font: item.fontName,
        });
      }
      pages.push({ width: round(width), height: round(height), items });
    }
    const producer = text(info.Producer);
    const creator = text(info.Creator);
    const title = text(info.Title);
    return {
      ok: true,
      doc: {
        meta: {
          ...(producer === undefined ? {} : { producer }),
          ...(creator === undefined ? {} : { creator }),
          ...(title === undefined ? {} : { title }),
        },
        pages,
      },
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : "Error";
    return { ok: false, reason: `cannot read this PDF (${name})` };
  } finally {
    await task.destroy();
  }
}
