CREATE TABLE "media_files" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"title" text NOT NULL,
	"aspect" text NOT NULL,
	"object_key" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "media_files_media_id" ON "media_files" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "media_files_user_id" ON "media_files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_files_workspace_id" ON "media_files" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "media_files_state_expires_at" ON "media_files" USING btree ("state","expires_at");