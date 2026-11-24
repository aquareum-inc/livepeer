CREATE TABLE "capability_settings" (
	"app" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"markup" double precision,
	"surfaces" text[],
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
