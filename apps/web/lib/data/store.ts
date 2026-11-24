/**
 * State read and changed as one value: a JSON file, or memory in tests. Each domain's store (device sessions,
 * moderation, alerts) has an implementation over one of these and one over Postgres, behind the same
 * interface, so nothing above a store knows which it has.
 */
export interface StateStore<T> {
  /** Reads, changes and writes the contents as one step. */
  update<R>(change: (contents: T) => R): R;
  read(): T;
}

/** The same interface in memory, for tests. */
export function memoryStore<T>(contents: T): StateStore<T> {
  let state = contents;
  return {
    read: () => structuredClone(state),
    update(change) {
      const next = structuredClone(state);
      const result = change(next);
      state = next;
      return result;
    },
  };
}
