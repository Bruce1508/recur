import { PROFILES } from "./profiles";
import type { BankProfile } from "./profiles/types";
import type { LineDocument } from "./types";

/** The first profile whose markers all match a line of the document, or null: unsupported format. */
export function detect(
  doc: LineDocument,
  profiles: readonly BankProfile[] = PROFILES,
): BankProfile | null {
  const texts = doc.lines.map((l) => l.text);
  return (
    profiles.find((p) =>
      p.markers.every((m) => texts.some((t) => m.test(t))),
    ) ?? null
  );
}
