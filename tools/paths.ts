import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * True when `target` is `root` or lies inside it. Both must already be resolved with
 * `realpathSync`, so a symlink cannot hide a location. Compared case-insensitively because the
 * default macOS file system is, and a false "inside" only makes the CLI refuse, never leak.
 */
export function isInside(root: string, target: string): boolean {
  const rel = relative(
    resolve(root).toLowerCase(),
    resolve(target).toLowerCase(),
  );
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

export type InputRead =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: string };

/**
 * Read one statement file for a local tool. The file's own real path (not its folder's) must lie
 * outside `repo`, so a symlink cannot smuggle an in-repo file in. A failure carries a fixed reason
 * and never the path or the system error text.
 */
export function readInput(repo: string, path: string): InputRead {
  try {
    if (isInside(repo, realpathSync(path)))
      return {
        ok: false,
        reason: "an input is inside this repository; keep statements outside",
      };
    return { ok: true, bytes: new Uint8Array(readFileSync(path)) };
  } catch {
    return { ok: false, reason: "an input file could not be read" };
  }
}
