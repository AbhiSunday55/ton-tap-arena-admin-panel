CREATE TABLE "config_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"action" text NOT NULL,
	"actor" text DEFAULT 'admin' NOT NULL,
	"pushed_to_game" boolean DEFAULT false NOT NULL,
	"push_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_values" (
	"path" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"size" bigint NOT NULL,
	"content_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "game_connection" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"base_url" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"admin_cookie" text,
	"cookie_saved_at" timestamp with time zone,
	"last_check_at" timestamp with time zone,
	"last_check_ok" boolean,
	"last_check_error" text,
	"last_push_at" timestamp with time zone,
	"last_push_ok" boolean,
	"last_push_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"delta_coin" bigint DEFAULT 0 NOT NULL,
	"delta_nano_ton" bigint DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panel_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"user_id" text PRIMARY KEY NOT NULL,
	"handle" text DEFAULT '' NOT NULL,
	"avatar" text,
	"telegram_id" text,
	"username" text,
	"wallet_address" text,
	"balance_coin" bigint DEFAULT 0 NOT NULL,
	"balance_nano_ton" bigint DEFAULT 0 NOT NULL,
	"vested_nano_ton" bigint DEFAULT 0 NOT NULL,
	"locked_nano_ton" bigint DEFAULT 0 NOT NULL,
	"total_taps" bigint DEFAULT 0 NOT NULL,
	"total_coin_mined" bigint DEFAULT 0 NOT NULL,
	"week_coin_mined" bigint DEFAULT 0 NOT NULL,
	"energy" integer DEFAULT 0 NOT NULL,
	"tap_power_level" integer DEFAULT 1 NOT NULL,
	"league_index" integer DEFAULT 0 NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_seed" boolean DEFAULT false NOT NULL,
	"referral_code" text,
	"referred_by" text,
	"referral_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_slug" text NOT NULL,
	"item_name" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"tier" text DEFAULT '' NOT NULL,
	"price_usdt_cents" integer DEFAULT 0 NOT NULL,
	"pay_currency" text DEFAULT 'TON' NOT NULL,
	"amount_nano_ton" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_completions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"offer_slug" text NOT NULL,
	"offer_title" text DEFAULT '' NOT NULL,
	"reward_coin" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'verified' NOT NULL,
	"proof_url" text,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"network" text DEFAULT 'TON' NOT NULL,
	"payout_address" text DEFAULT '' NOT NULL,
	"amount_nano_ton" bigint DEFAULT 0 NOT NULL,
	"fee_nano_ton" bigint DEFAULT 0 NOT NULL,
	"network_fee_nano_ton" bigint DEFAULT 0 NOT NULL,
	"net_nano_ton" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tx_hash" text,
	"fail_reason" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "config_audit_created_idx" ON "config_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "config_audit_path_idx" ON "config_audit" USING btree ("path");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "files_created_idx" ON "files" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ledger_user_idx" ON "ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_created_idx" ON "ledger" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "players_handle_idx" ON "players" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "players_week_idx" ON "players" USING btree ("week_coin_mined");--> statement-breakpoint
CREATE INDEX "players_created_idx" ON "players" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "purchases_user_idx" ON "purchases" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "purchases_created_idx" ON "purchases" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "task_completions_user_idx" ON "task_completions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_completions_offer_idx" ON "task_completions" USING btree ("offer_slug");--> statement-breakpoint
CREATE INDEX "withdrawals_user_idx" ON "withdrawals" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "withdrawals_status_idx" ON "withdrawals" USING btree ("status");