CREATE TABLE "alert_state" (
	"id" text PRIMARY KEY NOT NULL,
	"engine_down" boolean DEFAULT false NOT NULL,
	"engine_streak" integer DEFAULT 0 NOT NULL,
	"engine_told" text[] DEFAULT '{}'::text[] NOT NULL,
	"jobs_failing" boolean DEFAULT false NOT NULL,
	"jobs_last_seen_at" timestamp with time zone,
	"jobs_read_at" timestamp with time zone,
	"reports_last_sent_at" timestamp with time zone,
	"reports_unannounced" boolean DEFAULT false NOT NULL,
	"round_claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_outbox" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "push_outbox_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone NOT NULL,
	"platform" text NOT NULL,
	"environment" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_refusals" (
	"platform" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"detail" text NOT NULL
);
