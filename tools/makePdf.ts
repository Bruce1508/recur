// A tiny PDF writer for tests: text at known positions, standard Helvetica, ASCII only. It builds
// the bytes in memory; nothing is written to disk, so no PDF enters the repository (ADR-016).
// M5 task 3 will extend this into the full synthetic statement generator.

export interface PdfSpec {
  info?: { producer?: string; creator?: string; title?: string };
  pages: {
    width: number;
    height: number;
    /** `y` is measured from the top of the page, like `RawItem.y`. */
    items: { str: string; x: number; y: number }[];
  }[];
}

const FONT_SIZE = 10;
const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

export function makeTextPdf(spec: PdfSpec): Uint8Array {
  const objects: string[] = [];
  // Object numbers: 1 catalog, 2 pages, 3 font, 4 info, then a page and a content stream per page.
  const pageNo = (i: number) => 5 + i * 2;
  const info = spec.info ?? {};
  const infoEntries = [
    ["Producer", info.producer],
    ["Creator", info.creator],
    ["Title", info.title],
  ]
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => `/${k} (${esc(v)})`)
    .join(" ");

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${spec.pages.length} /Kids [${spec.pages
    .map((_, i) => `${pageNo(i)} 0 R`)
    .join(" ")}] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = `<< ${infoEntries} >>`;
  spec.pages.forEach((p, i) => {
    const content = p.items
      .map(
        (it) =>
          `BT /F1 ${FONT_SIZE} Tf 1 0 0 1 ${it.x} ${p.height - it.y} Tm (${esc(it.str)}) Tj ET`,
      )
      .join("\n");
    objects[pageNo(i)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.width} ${p.height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageNo(i) + 1} 0 R >>`;
    objects[pageNo(i) + 1] =
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objects.length; n++)
    out += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
