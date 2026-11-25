import { sql } from "drizzle-orm";
import { bigint, boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * The instance's tables, as Drizzle definitions. This file is the source of the row types and of every
 * migration: change it, then run `pnpm db:generate` and commit the SQL it writes.
 *
 * No table points at a user. `user_id` and `workspace_id` are the provider's opaque ids, and the provider
 * holds the names, emails and membership behind them. Where a name or an email has to be kept because the
 * provider can't yet be asked for it, it is in an `_sealed` column: encrypted with SESSION_SECRET, never in
 * the clear. Every `_hash` column is an HMAC keyed with the same secret, so a copy of the database signs
 * nobody in.
 */

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** A user's phone, signed in to the app. */
export const deviceSessions = pgTable(
  "device_sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["user", "operator"] }).notNull(),
    deviceName: text("device_name").notNull(),
    platform: text("platform", { enum: ["ios", "android"] }).notNull(),
    builderKeySealed: text("builder_key_sealed"),
    /** The person's name and email as the provider gave them at sign-in. */
    identitySealed: text("identity_sealed").notNull(),
    workspaceId: text("workspace_id"),
    createdAt: time("created_at").notNull(),
    lastUsedAt: time("last_used_at").notNull(),
  },
  (table) => [uniqueIndex("device_sessions_token_hash").on(table.tokenHash), index("device_sessions_user_id").on(table.userId)],
);

/** A finished sign-in waiting for its app to collect it. */
export const deviceSignInCodes = pgTable(
  "device_sign_in_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    challenge: text("challenge").notNull(),
    platform: text("platform", { enum: ["ios", "android"] }).notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["user", "operator"] }).notNull(),
    builderKeySealed: text("builder_key_sealed"),
    identitySealed: text("identity_sealed").notNull(),
    expiresAt: time("expires_at").notNull(),
  },
  (table) => [index("device_sign_in_codes_expires_at").on(table.expiresAt)],
);

/** An operator's phone, enrolled for the console. Kept apart from users' sessions: neither can stand in for the other. */
export const operatorDeviceSessions = pgTable(
  "operator_device_sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id").notNull(),
    identitySealed: text("identity_sealed").notNull(),
    deviceName: text("device_name").notNull(),
    platform: text("platform", { enum: ["ios", "android"] }).notNull(),
    publicKey: text("public_key").notNull(),
    createdAt: time("created_at").notNull(),
    lastUsedAt: time("last_used_at").notNull(),
    lastUnlockedAt: time("last_unlocked_at"),
    /** Null while locked. */
    unlockedUntil: time("unlocked_until"),
    failedProofs: integer("failed_proofs").notNull().default(0),
    /** The minute the request count below belongs to, as minutes since 1970. */
    windowStart: bigint("window_start", { mode: "number" }).notNull().default(0),
    windowCount: integer("window_count").notNull().default(0),
  },
  (table) => [uniqueIndex("operator_device_sessions_token_hash").on(table.tokenHash), index("operator_device_sessions_user_id").on(table.userId)],
);

export const operatorSignInCodes = pgTable(
  "operator_sign_in_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    challenge: text("challenge").notNull(),
    platform: text("platform", { enum: ["ios", "android"] }).notNull(),
    userId: text("user_id").notNull(),
    identitySealed: text("identity_sealed").notNull(),
    expiresAt: time("expires_at").notNull(),
  },
  (table) => [index("operator_sign_in_codes_expires_at").on(table.expiresAt)],
);

/** A nonce a phone was given to sign. It goes with its session. */
export const operatorChallenges = pgTable(
  "operator_challenges",
  {
    nonceHash: text("nonce_hash").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => operatorDeviceSessions.id, { onDelete: "cascade" }),
    operation: text("operation"),
    inputHash: text("input_hash"),
    expiresAt: time("expires_at").notNull(),
  },
  (table) => [index("operator_challenges_session_id").on(table.sessionId), index("operator_challenges_expires_at").on(table.expiresAt)],
);

/** Alerts on one operator's phone. A row ends with its session, however that ends, and a push token is on one phone only. */
export const operatorPushTokens = pgTable(
  "operator_push_tokens",
  {
    sessionId: text("session_id")
      .primaryKey()
      .references(() => operatorDeviceSessions.id, { onDelete: "cascade" }),
    kinds: text("kinds").array().notNull(),
    /** Sealed, not hashed: the instance has to send to it. Null once Apple or Google has said it is dead. */
    pushSealed: text("push_sealed"),
    pushHash: text("push_hash").notNull(),
    environment: text("environment", { enum: ["production", "development"] }).notNull(),
    setAt: time("set_at").notNull(),
    lastAlertAt: time("last_alert_at"),
    warnedAt: time("warned_at"),
  },
  (table) => [uniqueIndex("operator_push_tokens_push_hash").on(table.pushHash)],
);

/**
 * An operator closed the notice that a phone was added. One row per operator and phone, so the notice stays
 * for every operator who hasn't closed it. A row ends with its session, however that ends.
 */
export const operatorPhoneNoticeDismissals = pgTable(
  "operator_phone_notice_dismissals",
  {
    userId: text("user_id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => operatorDeviceSessions.id, { onDelete: "cascade" }),
    dismissedAt: time("dismissed_at").notNull(),
    /** When that operator next opened System, where the phone is listed. Null until then: System carries a dot. */
    seenAt: time("seen_at"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.sessionId] }), index("operator_phone_notice_dismissals_session_id").on(table.sessionId)],
);

/** What operators' phones did and were refused. Never a token, a key or a request body. */
export const operatorAudit = pgTable(
  "operator_audit",
  {
    id: text("id").primaryKey(),
    /** The order entries were written in, which two entries in the same millisecond would not otherwise have. */
    seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
    at: time("at").notNull(),
    event: text("event", { enum: ["sign_in", "sign_out", "unlock", "change", "refused", "revoked", "alert"] }).notNull(),
    userId: text("user_id").notNull(),
    /** The operator's name as it was when the entry was written. */
    actorSealed: text("actor_sealed").notNull(),
    deviceId: text("device_id"),
    deviceName: text("device_name"),
    operation: text("operation"),
    target: text("target"),
    detail: text("detail"),
  },
  (table) => [uniqueIndex("operator_audit_seq").on(table.seq), index("operator_audit_device_at").on(table.deviceId, table.at)],
);

/** A report of a shared character, for the operator to decide. */
export const characterReports = pgTable(
  "character_reports",
  {
    id: text("id").primaryKey(),
    characterSlug: text("character_slug").notNull(),
    characterName: text("character_name").notNull(),
    /** The handle the character was shared under. */
    author: text("author").notNull(),
    reason: text("reason").notNull(),
    note: text("note"),
    state: text("state", { enum: ["open", "dismissed", "hidden"] }).notNull(),
    /** Who sent it, so one person can't flood the queue. Null once their account is deleted; never sent to anyone. */
    reporterId: text("reporter_id"),
    createdAt: time("created_at").notNull(),
  },
  (table) => [
    // One person has at most one open report of a character; a second changes the first.
    uniqueIndex("character_reports_one_open").on(table.reporterId, table.characterSlug).where(sql`${table.state} = 'open'`),
    index("character_reports_state_created_at").on(table.state, table.createdAt),
    index("character_reports_character_slug").on(table.characterSlug),
  ],
);

/** A character one person chose not to see, with its author, whose other characters go too. */
export const characterBlocks = pgTable(
  "character_blocks",
  {
    userId: text("user_id").notNull(),
    characterSlug: text("character_slug").notNull(),
    author: text("author").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.characterSlug] })],
);

/** A character the operator took off the instance. */
export const hiddenCharacters = pgTable("hidden_characters", {
  characterSlug: text("character_slug").primaryKey(),
  hiddenAt: time("hidden_at").notNull().defaultNow(),
});

/**
 * What the console's Settings page last saved, laid over the config the instance was deployed with. One row.
 * It is a document on purpose: it is validated whole against the config's schema, read whole and written
 * whole, and never searched by field.
 */
export const instanceSettings = pgTable("instance_settings", {
  /** Always "instance": there is one. */
  id: text("id").primaryKey(),
  settings: jsonb("settings").notNull(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});

/** One capability's settings as the console last saved them, in place of what the config says of it. */
export const capabilitySettings = pgTable("capability_settings", {
  app: text("app").primaryKey(),
  enabled: boolean("enabled").notNull(),
  /** Null for no markup of its own: the instance's default applies. */
  markup: doublePrecision("markup"),
  /** Null to appear wherever it does by default. */
  surfaces: text("surfaces").array(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});

/**
 * What the instance has noticed and said to operators' phones, and when the checks last ran. One row, so a
 * restart, a second server or a function that has just started doesn't say it all again.
 */
export const alertState = pgTable("alert_state", {
  /** Always "alerts": there is one. */
  id: text("id").primaryKey(),
  /** Whether phones have been told the engine isn't ready. */
  engineDown: boolean("engine_down").notNull().default(false),
  /** Checks in a row that disagree with `engine_down`. */
  engineStreak: integer("engine_streak").notNull().default(0),
  /** The sessions that were told, so "ready again" goes to them and nobody else. */
  engineTold: text("engine_told").array().notNull().default(sql`'{}'::text[]`),
  jobsFailing: boolean("jobs_failing").notNull().default(false),
  jobsLastSeenAt: time("jobs_last_seen_at"),
  /** When recent jobs were last read: they are read less often than the engine is asked. */
  jobsReadAt: time("jobs_read_at"),
  reportsLastSentAt: time("reports_last_sent_at"),
  reportsUnannounced: boolean("reports_unannounced").notNull().default(false),
  /** When a round of checks was last started. Whoever moves this forward runs the round; nobody else does. */
  roundClaimedAt: time("round_claimed_at"),
});

/** When Apple or Google last refused the instance's own credentials. Cleared by a send they accept. */
export const pushRefusals = pgTable("push_refusals", {
  platform: text("platform", { enum: ["ios", "android"] }).primaryKey(),
  at: time("at").notNull(),
  detail: text("detail").notNull(),
});

/** What mock-only mode would have sent, newest last. Nothing here ever reaches Apple or Google. */
export const pushOutbox = pgTable("push_outbox", {
  seq: bigint("seq", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  at: time("at").notNull(),
  platform: text("platform", { enum: ["ios", "android"] }).notNull(),
  environment: text("environment", { enum: ["production", "development"] }).notNull(),
  /** The payload as it would have been handed over, less the push token. */
  payload: jsonb("payload").notNull(),
});

// ---------------------------------------------------------------------------
// Conversations — persisted chat threads, so restarts don't lose them.
// ---------------------------------------------------------------------------

/** A chat conversation between a user and the agent. */
export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** Null in a personal account; the workspace's id in a shared one. */
    workspaceId: text("workspace_id"),
    title: text("title").notNull(),
    /** The language model chosen for the conversation, as an offering app name. */
    agentModel: text("agent_model"),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
  },
  (table) => [
    index("conversations_user_workspace").on(table.userId, table.workspaceId),
    index("conversations_updated_at").on(table.updatedAt),
  ],
);

/** One message in a conversation: a user turn or an assistant reply. */
export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    /** The language model the user picked for this turn, or that answered it. */
    agentModel: text("agent_model"),
    /** The Livepeer network's job id for the assistant's reply, when it ran a job. */
    jobId: text("job_id"),
    /** Token usage from the runner, as JSON: `{ prompt_tokens, completion_tokens, total_tokens }`. */
    usage: jsonb("usage"),
    createdAt: time("created_at").notNull(),
  },
  (table) => [
    index("conversation_messages_conversation_id").on(table.conversationId),
  ],
);
