export type Theme = "system" | "light" | "dark";

const ORDER: readonly Theme[] = ["system", "light", "dark"];

export const nextTheme = (t: Theme): Theme =>
  ORDER[(ORDER.indexOf(t) + 1) % ORDER.length] as Theme;

/** `system` removes the override so the OS setting decides (`color-scheme: light dark`). */
export function applyTheme(t: Theme, root: HTMLElement): void {
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
}
