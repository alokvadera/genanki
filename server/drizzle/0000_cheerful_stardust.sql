CREATE TABLE "adaptive_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"document_max_chunks" integer NOT NULL,
	"completion_passes" integer NOT NULL,
	"updated_at" bigint NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloudflare_neuron_budget" (
	"utc_day" text PRIMARY KEY NOT NULL,
	"neurons_used" real NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"requested_count" integer NOT NULL,
	"progress" real NOT NULL,
	"eta_seconds" integer NOT NULL,
	"timeout_seconds" integer NOT NULL,
	"deadline_at" bigint NOT NULL,
	"message" text NOT NULL,
	"provider" text,
	"model" text,
	"provider_index" integer NOT NULL,
	"model_index" integer NOT NULL,
	"total_providers" integer NOT NULL,
	"total_models" integer NOT NULL,
	"section_index" integer NOT NULL,
	"total_sections" integer NOT NULL,
	"result_deck_name" text,
	"result_summary" text,
	"result_cards" jsonb,
	"result_partial" boolean,
	"result_warnings" jsonb,
	"fallback_trail" jsonb,
	"cancel_requested_at" bigint,
	"canceled_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"creation_time" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"creator_ip_hash" text,
	"creator_device_id_hash" text,
	"enc_deck_name" text,
	"enc_summary" text,
	"enc_cards" text,
	"enc_message" text,
	"enc_error" text
);
--> statement-breakpoint
CREATE TABLE "generation_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"job_id" uuid,
	"kind" text,
	"requested_count" integer,
	"generated_count" integer,
	"duplicate_count" integer,
	"source_chars" bigint,
	"parse_failures" integer,
	"duration_ms" bigint,
	"tokens_used" bigint,
	"metric" real,
	"provider" text,
	"model" text,
	"outcome" text,
	"latency_ms" bigint,
	"neurons" real,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_rate_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id_hash" text,
	"associated_ips" jsonb,
	"ip" text NOT NULL,
	"day_window_start" bigint NOT NULL,
	"day_tokens_used" bigint NOT NULL,
	"total_tokens_all_time" bigint NOT NULL,
	"total_requests" integer NOT NULL,
	"last_seen_at" bigint NOT NULL,
	"first_seen_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text NOT NULL,
	"device_id_hash" text,
	"is_blocked" boolean NOT NULL,
	"custom_daily_limit" integer,
	"note" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"model_count" integer NOT NULL,
	"models" jsonb NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"calls" integer NOT NULL,
	"successes" integer NOT NULL,
	"failures" integer NOT NULL,
	"timeouts" integer NOT NULL,
	"average_latency_ms" real NOT NULL,
	"average_tokens" real NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_rate_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"window_started_at" bigint NOT NULL,
	"requests_used" integer NOT NULL,
	"tokens_used" bigint NOT NULL,
	"day_started_at" bigint NOT NULL,
	"day_requests_used" integer NOT NULL,
	"cooldown_until" bigint NOT NULL,
	"last_status" integer,
	"remaining_requests" integer,
	"remaining_tokens" bigint,
	"reset_at" bigint,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_label" text NOT NULL,
	"model" text NOT NULL,
	"kind" text NOT NULL,
	"job_id" uuid,
	"prompt_tokens" bigint NOT NULL,
	"completion_tokens" bigint NOT NULL,
	"total_tokens" bigint NOT NULL,
	"ip" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"summary" text NOT NULL,
	"recommendation" text NOT NULL,
	"trigger_calls" integer NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_telemetry" ADD CONSTRAINT "generation_telemetry_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "generation_jobs_created_at_idx" ON "generation_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "generation_jobs_ip_hash_created_at_idx" ON "generation_jobs" USING btree ("creator_ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "generation_jobs_device_hash_created_at_idx" ON "generation_jobs" USING btree ("creator_device_id_hash","created_at");--> statement-breakpoint
CREATE INDEX "generation_telemetry_created_at_idx" ON "generation_telemetry" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "generation_telemetry_job_id_created_at_idx" ON "generation_telemetry" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ip_rate_state_ip_key" ON "ip_rate_state" USING btree ("ip");--> statement-breakpoint
CREATE UNIQUE INDEX "ip_rate_state_device_id_hash_key" ON "ip_rate_state" USING btree ("device_id_hash");--> statement-breakpoint
CREATE INDEX "ip_rate_state_last_seen_at_idx" ON "ip_rate_state" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "ip_rules_ip_idx" ON "ip_rules" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "ip_rules_device_id_hash_idx" ON "ip_rules" USING btree ("device_id_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_catalog_provider_key" ON "provider_catalog" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_performance_provider_model_key" ON "provider_performance" USING btree ("provider","model");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_rate_state_provider_model_key" ON "provider_rate_state" USING btree ("provider","model");--> statement-breakpoint
CREATE INDEX "provider_rate_state_updated_at_idx" ON "provider_rate_state" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "provider_usage_created_at_idx" ON "provider_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "provider_usage_provider_created_at_idx" ON "provider_usage" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "provider_usage_job_id_created_at_idx" ON "provider_usage" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "provider_usage_ip_created_at_idx" ON "provider_usage" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "system_insights_created_at_idx" ON "system_insights" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");