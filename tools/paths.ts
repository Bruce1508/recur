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
