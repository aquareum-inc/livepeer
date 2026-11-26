CREATE TABLE "operator_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"token_hash" text,
	"invited_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"accepted_by" text,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"source" text NOT NULL,
	"identity_sealed" text NOT NULL,
	"granted_by" text,
	"invitation_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "operator_invitations_token_hash" ON "operator_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "operator_invitations_expires_at" ON "operator_invitations" USING btree ("expires_at");