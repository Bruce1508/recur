import { useState } from "react";
import {
  LABEL_LIMITS,
  parseLabels,
  removeLabel,
  serialiseLabels,
  setLabel,
} from "../core/merchant/labels";
import type { LabelFile } from "../core/merchant/types";

export interface KeyChoice {
  readonly key: string;
  /** The name the line is shown under now, or null when it is not recognised. */
  readonly shownAs: string | null;
}

const BTN_QUIET =
  "rounded-pill border border-ink/55 bg-white-sheet px-4 py-1 text-ink";
const BTN =
  "rounded-pill bg-mint-note px-5 py-1.5 font-medium text-blurple shadow-pill";
const FINE = "text-sm text-quiet-gray";

/**
 * Name a cleaned description once; the name applies to every line with that same key and to no
 * other (FR-18). Labels live in memory only: the file download and load are user-initiated.
 */
export function Labels({
  choices,
  labels,
  onChange,
}: {
  choices: readonly KeyChoice[];
  labels: LabelFile;
  onChange: (next: LabelFile) => void;
}) {
  const [chosen, setChosen] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const key = choices.some((c) => c.key === chosen)
    ? chosen
    : (choices[0]?.key ?? "");
  const href = `data:application/json;charset=utf-8,${encodeURIComponent(serialiseLabels(labels))}`;

  async function load(file: File | undefined) {
    if (!file) return;
    if (file.size > LABEL_LIMITS.bytes) {
      setMessage({ ok: false, text: "The label file is too large." });
      return;
    }
    const parsed = parseLabels(await file.text().catch(() => ""));
    if (!parsed.ok) {
      setMessage({
        ok: false,
        text: `${parsed.error} No labels were changed.`,
      });
      return;
    }
    onChange(parsed.file);
    setMessage({
      ok: true,
      text: `Loaded ${parsed.file.labels.length} label(s), replacing the current ones.`,
    });
  }

  return (
    <div className="mt-6 border-t border-stone pt-4">
      <h3 className="font-bold">Name a line</h3>
      <p className={FINE}>
        A name you give applies to every line with the same cleaned description
        and to no other. It is kept only while this page is open; download the
        labels to use them again.
      </p>
      {choices.length > 0 && (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const result = setLabel(labels, key, name);
            if (!result.ok) {
              setMessage({ ok: false, text: result.error });
              return;
            }
            onChange(result.file);
            setName("");
            setMessage({ ok: true, text: `Named ${key}.` });
          }}
        >
          <label className="flex min-w-0 max-w-full flex-col gap-1">
            Line
            <select
              className="max-w-full"
              value={key}
              onChange={(e) => setChosen(e.target.value)}
            >
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.key} ({c.shownAs ?? "Not recognised"})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Name
            <input
              type="text"
              value={name}
              maxLength={LABEL_LIMITS.name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-ink/55 bg-white-sheet px-2 py-1"
            />
          </label>
          <button type="submit" className={BTN}>
            Apply name
          </button>
        </form>
      )}
      {message && (
        <p
          className={`mt-2 ${message.ok ? "" : "text-warning-ink"}`}
          role={message.ok ? "status" : "alert"}
          data-testid="label-message"
        >
          {message.text}
        </p>
      )}
      {labels.labels.length > 0 && (
        <ul className="mt-3" data-testid="label-list">
          {labels.labels.map((l) => (
            <li
              key={l.key}
              className="flex flex-wrap items-center gap-2 py-0.5"
            >
              <span>
                {l.key} {"→"} {l.name}
              </span>
              <button
                type="button"
                className={BTN_QUIET}
                aria-label={`Remove the name for ${l.key}`}
                onClick={() => onChange(removeLabel(labels, l.key))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {labels.labels.length > 0 && (
          <a href={href} download="recur-labels.json" className={BTN}>
            Download names (JSON)
          </a>
        )}
        <label className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          Load names
          <input
            type="file"
            accept=".json,application/json"
            data-testid="labels-input"
            onChange={(e) => {
              const input = e.currentTarget;
              void load(input.files?.[0]).then(() => {
                input.value = "";
              });
            }}
          />
        </label>
      </div>
    </div>
  );
}
