// The only file that imports pdfjs-dist (enforced by the import-boundary lint rule).
// Uses the legacy build, which runs in Node as well as the browser.

import {
  GlobalWorkerOptions,
  getDocument,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { RawDocument, RawItem, RawPage } from "../core/types";

export type ExtractResult =
  | { ok: true; doc: RawDocument }
  | { ok: false; reason: string };

// Node presets its own in-process worker. A browser starts the worker from our own origin (CSP
// worker-src 'self') when this module loads, so PDFs still open after the network drops (AC-5).
GlobalWorkerOptions.workerSrc ||= workerUrl;
if (typeof Worker !== "undefined")
  GlobalWorkerOptions.workerPort ??= new Worker(workerUrl, { type: "module" });

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
      // The viewport applies the page box origin and /Rotate, so x and y are from the top-left of
      // the page as displayed, and width and height match.
      const viewport = page.getViewport({ scale: 1 });
      const { width, height } = viewport;
      const items: RawItem[] = [];
      for (const item of (await page.getTextContent()).items) {
        if (!("str" in item) || item.str === "") continue;
        const [, , , , e, f] = item.transform as number[];
        const [x, y] = viewport.convertToViewportPoint(e ?? 0, f ?? 0);
        items.push({
          str: item.str,
          x: round(x ?? 0),
          y: round(y ?? 0),
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
