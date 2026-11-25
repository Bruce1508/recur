import { useState } from "react";
import { applyTheme, nextTheme, type Theme } from "./theme";

const LABEL: Record<Theme, string> = {
  system: "Match system",
  light: "Light",
  dark: "Dark",
};

/** Lasts for the visit: no browser storage is allowed in `src/` (ADR-010), so a reload follows the OS. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  return (
    <button
      type="button"
      className="rounded-pill border border-ink/55 px-4 py-1 text-sm"
      onClick={() => {
        const next = nextTheme(theme);
        applyTheme(next, document.documentElement);
        setTheme(next);
      }}
    >
      Theme: {LABEL[theme]}
    </button>
  );
}
