import "server-only";

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { env } from "../env";
import type { StateStore } from "./store";

/** The directory the instance writes its state to: DATA_DIR, or `.data` at the repository root. */
function dataDirectory(): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), "../..", env("DATA_DIR") || ".data");
}

/**
 * A JSON file in the instance's data directory: where an instance with no database keeps its state, which is
 * how development, tests and CI run. Each domain's store has an implementation over one of these. It re-reads
 * the file whenever it changed on disk, so every server module sees the same state, and writes through a
 * temporary file so a crash never leaves half a file.
 */
export function jsonFileStore<T>(name: string, parse: (value: Partial<T>) => T, file = path.join(dataDirectory(), name)): StateStore<T> {
  let cache: { contents: T; stamp: number } | null = null;

  const stamp = () => {
    try {
      return statSync(/* turbopackIgnore: true */ file).mtimeMs;
    } catch {
      return 0;
    }
  };

  const read = (): T => {
    const current = stamp();
    if (cache && cache.stamp === current) return cache.contents;
    const contents = parse(current === 0 ? {} : (JSON.parse(readFileSync(/* turbopackIgnore: true */ file, "utf8")) as Partial<T>));
    cache = { contents, stamp: current };
    return contents;
  };

  return {
    read: () => structuredClone(read()),
    update(change) {
      const contents = structuredClone(read());
      const result = change(contents);
      mkdirSync(/* turbopackIgnore: true */ path.dirname(file), { recursive: true, mode: 0o700 });
      const temporary = `${file}.${process.pid}.tmp`;
      writeFileSync(/* turbopackIgnore: true */ temporary, JSON.stringify(contents), { mode: 0o600 });
      renameSync(/* turbopackIgnore: true */ temporary, file);
      cache = { contents, stamp: stamp() };
      return result;
    },
  };
}
