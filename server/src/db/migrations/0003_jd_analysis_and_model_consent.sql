CREATE TABLE "jd_analyses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"draft_revision" integer NOT NULL,
	"jd_hash" text NOT NULL,
	"mode" text NOT NULL,
	"model" text,
	"prompt_version" text,
	"status" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"degrade_reason" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "model_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jd_analyses" ADD CONSTRAINT "jd_analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jd_analyses_key_idx" ON "jd_analyses" USING btree ("user_id","draft_revision","jd_hash","mode");--> statement-breakpoint
CREATE INDEX "jd_analyses_user_idx" ON "jd_analyses" USING btree ("user_id","created_at");