CREATE TABLE "operator_phone_notice_dismissals" (
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"dismissed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operator_phone_notice_dismissals_user_id_session_id_pk" PRIMARY KEY("user_id","session_id")
);
--> statement-breakpoint
ALTER TABLE "operator_phone_notice_dismissals" ADD CONSTRAINT "operator_phone_notice_dismissals_session_id_operator_device_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."operator_device_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operator_phone_notice_dismissals_session_id" ON "operator_phone_notice_dismissals" USING btree ("session_id");