/**
 * The instance's tables, as Drizzle definitions. This file is the source of the row types and of every
 * migration: change it, then run `pnpm db:generate` and commit the SQL it writes.
 *
 * No table points at a user. `user_id` and `workspace_id` are the provider's opaque ids, and the provider
 * holds the names, emails and membership behind them.
 */
export {};
