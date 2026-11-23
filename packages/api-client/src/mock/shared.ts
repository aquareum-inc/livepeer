/**
 * One copy of a mock store per process. A server framework may load this package more than once (Next
 * loads it separately for pages and for API routes), and a file asked for by a page has to be known to the
 * route that receives it.
 */
/**
 * Whose a mocked thing is when it belongs to a workspace: the workspace, and the member who made it. Null
 * throughout the mock stores means a personal account, which the mock keeps as one shared demo account.
 */
export interface Owner {
  scope: string;
  by: string;
}

export function shared<T>(key: string, make: () => T): T {
  const stores = globalThis as { livepeerMockStores?: Map<string, unknown> };
  const all = (stores.livepeerMockStores ??= new Map());
  if (!all.has(key)) all.set(key, make());
  return all.get(key) as T;
}
