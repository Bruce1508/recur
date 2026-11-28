// The only file that imports pdfjs-dist (enforced by the import-boundary lint rule).
// Uses the legacy build, which runs in Node as well as the browser.

import {
  GlobalWorkerOptions,
  getDocument,
  PDFWorker,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { RawDocument, RawItem, RawPage } from "../core/types";
import {
  READER_START_FAILED,
  type WorkerWatch,
  watchWorker,
} from "./workerGuard";

export type ExtractResult =
  | { ok: true; doc: RawDocument }
  | { ok: false; reason: string };

// Node presets its own in-process worker. A browser starts the worker from our own origin (CSP
// worker-src 'self') when this module loads, so PDFs still open after the network drops (AC-5).
// The worker is passed to getDocument rather than set as workerPort: a task destroys only a worker
// it created, so one PDF finishing cannot tear down another that is still being read.
GlobalWorkerOptions.workerSrc ||= workerUrl;

interface Reader {
  worker: PDFWorker;
  watch: WorkerWatch;
}

function startReader(): Reader | undefined {
  if (typeof Worker === "undefined") return undefined;
  const port = new Worker(workerUrl, { type: "module" });
  return { worker: PDFWorker.create({ port }), watch: watchWorker(port) };
}

let reader = startReader();

// A failed worker is discarded so the next file starts a fresh one.
function discard(failed: Reader) {
  failed.watch.stop();
  if (!failed.worker.destroyed) failed.worker.destroy();
  if (reader === failed) reader = undefined;
}

const round = (n: number) => Math.round(n * 100) / 100;
const text = (v: unknown) =>
  typeof v === "string" && v !== "" ? v : undefined;

/**
 * PDF bytes to positioned text. Fails closed: a damaged, encrypted or non-PDF file gives a reason
 * made of the error's class name only, because a library message can quote the file.
 */
export async function extractPdf(data: Uint8Array): Promise<ExtractResult> {
  reader ??= startReader();
  const used = reader;
  let readerFailed = false;
  // pdf.js takes ownership of the buffer it is given, so hand it a copy.
  const task = getDocument({
    data: data.slice(),
    disableFontFace: true,
    verbosity: 0,
    ...(used === undefined ? {} : { worker: used.worker }),
  });
  try {
    const pdf = await (used === undefined
      ? task.promise
      : Promise.race([task.promise, used.watch.failed]));
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
    if (
      used !== undefined &&
      e instanceof Error &&
      e.message === READER_START_FAILED
    ) {
      readerFailed = true;
      discard(used);
      return { ok: false, reason: READER_START_FAILED };
    }
    const name = e instanceof Error ? e.name : "Error";
    return { ok: false, reason: `cannot read this PDF (${name})` };
  } finally {
    // A dead worker never answers the destroy request, so do not wait for it.
    if (readerFailed) task.destroy().catch(() => {});
    else await task.destroy();
  }
}
