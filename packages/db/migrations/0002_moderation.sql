CREATE TABLE "character_blocks" (
	"user_id" text NOT NULL,
	"character_slug" text NOT NULL,
	"author" text NOT NULL,
	CONSTRAINT "character_blocks_user_id_character_slug_pk" PRIMARY KEY("user_id","character_slug")
);
--> statement-breakpoint
CREATE TABLE "character_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"character_slug" text NOT NULL,
	"character_name" text NOT NULL,
	"author" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"state" text NOT NULL,
	"reporter_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hidden_characters" (
	"character_slug" text PRIMARY KEY NOT NULL,
	"hidden_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "character_reports_one_open" ON "character_reports" USING btree ("reporter_id","character_slug") WHERE "character_reports"."state" = 'open';--> statement-breakpoint
CREATE INDEX "character_reports_state_created_at" ON "character_reports" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "character_reports_character_slug" ON "character_reports" USING btree ("character_slug");