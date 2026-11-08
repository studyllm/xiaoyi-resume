CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"engine" text NOT NULL,
	"model" text,
	"prompt_version" text,
	"draft_revision" integer,
	"jd_hash" text,
	"status" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"claims" integer DEFAULT 0 NOT NULL,
	"reverted" integer DEFAULT 0 NOT NULL,
	"raw_output" text,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generations_user_idx" ON "generations" USING btree ("user_id","created_at");