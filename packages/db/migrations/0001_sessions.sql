CREATE TABLE "device_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"device_name" text NOT NULL,
	"platform" text NOT NULL,
	"builder_key_sealed" text,
	"identity_sealed" text NOT NULL,
	"workspace_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_sign_in_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"challenge" text NOT NULL,
	"platform" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"builder_key_sealed" text,
	"identity_sealed" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "operator_audit_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone NOT NULL,
	"event" text NOT NULL,
	"user_id" text NOT NULL,
	"actor_sealed" text NOT NULL,
	"device_id" text,
	"device_name" text,
	"operation" text,
	"target" text,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "operator_challenges" (
	"nonce_hash" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"operation" text,
	"input_hash" text,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_device_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"identity_sealed" text NOT NULL,
	"device_name" text NOT NULL,
	"platform" text NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	"last_unlocked_at" timestamp with time zone,
	"unlocked_until" timestamp with time zone,
	"failed_proofs" integer DEFAULT 0 NOT NULL,
	"window_start" bigint DEFAULT 0 NOT NULL,
	"window_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_push_tokens" (
	"session_id" text PRIMARY KEY NOT NULL,
	"kinds" text[] NOT NULL,
	"push_sealed" text,
	"push_hash" text NOT NULL,
	"environment" text NOT NULL,
	"set_at" timestamp with time zone NOT NULL,
	"last_alert_at" timestamp with time zone,
	"warned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operator_sign_in_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"challenge" text NOT NULL,
	"platform" text NOT NULL,
	"user_id" text NOT NULL,
	"identity_sealed" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operator_challenges" ADD CONSTRAINT "operator_challenges_session_id_operator_device_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."operator_device_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_push_tokens" ADD CONSTRAINT "operator_push_tokens_session_id_operator_device_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."operator_device_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_sessions_token_hash" ON "device_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "device_sessions_user_id" ON "device_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_sign_in_codes_expires_at" ON "device_sign_in_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_audit_seq" ON "operator_audit" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "operator_audit_device_at" ON "operator_audit" USING btree ("device_id","at");--> statement-breakpoint
CREATE INDEX "operator_challenges_session_id" ON "operator_challenges" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "operator_challenges_expires_at" ON "operator_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_device_sessions_token_hash" ON "operator_device_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "operator_device_sessions_user_id" ON "operator_device_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_push_tokens_push_hash" ON "operator_push_tokens" USING btree ("push_hash");--> statement-breakpoint
CREATE INDEX "operator_sign_in_codes_expires_at" ON "operator_sign_in_codes" USING btree ("expires_at");