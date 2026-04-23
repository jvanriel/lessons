CREATE TABLE "cms_block_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"block_id" integer NOT NULL,
	"page_slug" varchar(100) NOT NULL,
	"block_key" varchar(200) NOT NULL,
	"locale" varchar(5) DEFAULT 'en' NOT NULL,
	"content" text NOT NULL,
	"changed_by" integer,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_slug" varchar(100) NOT NULL,
	"block_key" varchar(200) NOT NULL,
	"locale" varchar(5) DEFAULT 'en' NOT NULL,
	"content" text NOT NULL,
	"format" varchar(20) DEFAULT 'text',
	"source_hash" varchar(64),
	"translated_at" timestamp,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_page_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_slug" varchar(100) NOT NULL,
	"locale" varchar(5) DEFAULT 'en' NOT NULL,
	"version" integer NOT NULL,
	"blocks" jsonb NOT NULL,
	"published_by" integer,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"message" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "comment_reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"comment_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"emoji" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"context_type" varchar(20) NOT NULL,
	"context_id" integer NOT NULL,
	"author_id" integer,
	"content" text NOT NULL,
	"type" varchar(20) DEFAULT 'comment' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"reply_to_id" integer,
	"attachments" jsonb,
	"metadata" jsonb,
	"edited_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(100) NOT NULL,
	"level" varchar(10) DEFAULT 'info' NOT NULL,
	"actor_id" integer,
	"target_id" integer,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"pro_profile_id" integer NOT NULL,
	"booked_by_id" integer NOT NULL,
	"pro_location_id" integer NOT NULL,
	"date" date NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"participant_count" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'confirmed' NOT NULL,
	"notes" text,
	"price_cents" integer,
	"currency" varchar(3) DEFAULT 'eur' NOT NULL,
	"payment_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"stripe_checkout_session_id" varchar(255),
	"stripe_invoice_item_id" varchar(255),
	"platform_fee_cents" integer,
	"paid_at" timestamp,
	"refunded_at" timestamp,
	"manage_token" varchar(64) NOT NULL,
	"google_event_id" varchar(255),
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_bookings_manage_token_unique" UNIQUE("manage_token")
);
--> statement-breakpoint
CREATE TABLE "lesson_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" varchar(500),
	"city" varchar(255),
	"country" varchar(100),
	"lat" numeric,
	"lng" numeric,
	"timezone" varchar(50) DEFAULT 'Europe/Brussels' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"target_user_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text,
	"action_url" varchar(500),
	"action_label" varchar(100),
	"metadata" jsonb,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"pro_profile_id" integer NOT NULL,
	"pro_location_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"valid_from" date,
	"valid_until" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_availability_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"pro_profile_id" integer NOT NULL,
	"pro_location_id" integer,
	"date" date NOT NULL,
	"type" varchar(20) NOT NULL,
	"start_time" varchar(5),
	"end_time" varchar(5),
	"reason" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"pro_profile_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"price_indication" varchar(100),
	"lesson_duration" integer,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_mailing_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"pro_profile_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"first_name" varchar(255),
	"last_name" varchar(255),
	"source" varchar(20) DEFAULT 'manual' NOT NULL,
	"unsubscribed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_mailings" (
	"id" serial PRIMARY KEY NOT NULL,
	"pro_profile_id" integer NOT NULL,
	"subject" varchar(255) NOT NULL,
	"body_html" text NOT NULL,
	"page_id" integer,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"pro_profile_id" integer NOT NULL,
	"slug" varchar(100) NOT NULL,
	"type" varchar(20) DEFAULT 'flyer' NOT NULL,
	"title" varchar(255) NOT NULL,
	"meta_description" varchar(300),
	"hero_image" varchar(500),
	"intro" text,
	"sections" jsonb,
	"cta_label" varchar(100),
	"cta_url" varchar(500),
	"cta_email" varchar(255),
	"translations" jsonb,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"bio" text,
	"specialties" varchar(500),
	"photo_url" varchar(500),
	"lesson_durations" jsonb DEFAULT '[60]'::jsonb NOT NULL,
	"max_group_size" integer DEFAULT 4 NOT NULL,
	"price_per_hour" text,
	"lesson_pricing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_timezone" varchar(50) DEFAULT 'Europe/Brussels' NOT NULL,
	"booking_enabled" boolean DEFAULT true NOT NULL,
	"booking_notice" integer DEFAULT 24 NOT NULL,
	"booking_horizon" integer DEFAULT 60 NOT NULL,
	"cancellation_hours" integer DEFAULT 24 NOT NULL,
	"late_cancel_refund_percent" integer DEFAULT 0 NOT NULL,
	"allow_booking_without_payment" boolean DEFAULT false NOT NULL,
	"google_calendar_email" varchar(255),
	"published" boolean DEFAULT false NOT NULL,
	"subscription_status" varchar(20) DEFAULT 'none' NOT NULL,
	"stripe_subscription_id" varchar(255),
	"subscription_plan" varchar(20),
	"subscription_current_period_end" timestamp,
	"subscription_trial_end" timestamp,
	"bank_account_holder" varchar(255),
	"bank_iban" varchar(34),
	"bank_bic" varchar(11),
	"invoicing_type" varchar(20) DEFAULT 'individual' NOT NULL,
	"company_name" varchar(255),
	"vat_number" varchar(50),
	"invoice_address_line1" varchar(255),
	"invoice_address_line2" varchar(255),
	"invoice_postcode" varchar(20),
	"invoice_city" varchar(100),
	"invoice_country" varchar(2),
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pro_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "pro_students" (
	"id" serial PRIMARY KEY NOT NULL,
	"pro_profile_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"source" varchar(20) DEFAULT 'self' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_message_at" timestamp,
	"preferred_location_id" integer,
	"preferred_duration" integer,
	"preferred_day_of_week" integer,
	"preferred_time" varchar(20),
	"preferred_interval" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_event_id" varchar(255) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"related_user_id" integer,
	"related_booking_id" integer,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "task_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"content" text NOT NULL,
	"author_name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"column" varchar(20) DEFAULT 'todo' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"assignee_ids" jsonb,
	"shared_with_ids" jsonb,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"color_label" varchar(20),
	"due_date" timestamp,
	"checklist" jsonb,
	"completed_at" timestamp,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"label" varchar(50),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"password" varchar(255),
	"roles" varchar(255) DEFAULT '',
	"preferred_locale" varchar(5) DEFAULT 'en',
	"email_opt_out" boolean DEFAULT false,
	"email_verified_at" timestamp,
	"stripe_customer_id" varchar(255),
	"handicap" numeric,
	"golf_goals" jsonb,
	"golf_goals_other" varchar(500),
	"onboarding_completed_at" timestamp,
	"last_login_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "cms_block_history" ADD CONSTRAINT "cms_block_history_block_id_cms_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."cms_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_block_history" ADD CONSTRAINT "cms_block_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_blocks" ADD CONSTRAINT "cms_blocks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_page_versions" ADD CONSTRAINT "cms_page_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_bookings" ADD CONSTRAINT "lesson_bookings_pro_profile_id_pro_profiles_id_fk" FOREIGN KEY ("pro_profile_id") REFERENCES "public"."pro_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_bookings" ADD CONSTRAINT "lesson_bookings_booked_by_id_users_id_fk" FOREIGN KEY ("booked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_bookings" ADD CONSTRAINT "lesson_bookings_pro_location_id_pro_locations_id_fk" FOREIGN KEY ("pro_location_id") REFERENCES "public"."pro_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_participants" ADD CONSTRAINT "lesson_participants_booking_id_lesson_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."lesson_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_availability" ADD CONSTRAINT "pro_availability_pro_profile_id_pro_profiles_id_fk" FOREIGN KEY ("pro_profile_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_availability" ADD CONSTRAINT "pro_availability_pro_location_id_pro_locations_id_fk" FOREIGN KEY ("pro_location_id") REFERENCES "public"."pro_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_availability_overrides" ADD CONSTRAINT "pro_availability_overrides_pro_profile_id_pro_profiles_id_fk" FOREIGN KEY ("pro_profile_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_availability_overrides" ADD CONSTRAINT "pro_availability_overrides_pro_location_id_pro_locations_id_fk" FOREIGN KEY ("pro_location_id") REFERENCES "public"."pro_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_locations" ADD CONSTRAINT "pro_locations_pro_profile_id_pro_profiles_id_fk" FOREIGN KEY ("pro_profile_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_locations" ADD CONSTRAINT "pro_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_mailing_contacts" ADD CONSTRAINT "pro_mailing_contacts_pro_profile_id_pro_profiles_id_fk" FOREIGN KEY ("pro_profile_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_mailings" ADD CONSTRAINT "pro_mailings_pro_profile_id_pro_profiles_id_fk" FOREIGN KEY ("pro_profile_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_mailings" ADD CONSTRAINT "pro_mailings_page_id_pro_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pro_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_pages" ADD CONSTRAINT "pro_pages_pro_profile_id_pro_profiles_id_fk" FOREIGN KEY ("pro_profile_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_profiles" ADD CONSTRAINT "pro_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_students" ADD CONSTRAINT "pro_students_pro_profile_id_pro_profiles_id_fk" FOREIGN KEY ("pro_profile_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_students" ADD CONSTRAINT "pro_students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_students" ADD CONSTRAINT "pro_students_preferred_location_id_pro_locations_id_fk" FOREIGN KEY ("preferred_location_id") REFERENCES "public"."pro_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_related_user_id_users_id_fk" FOREIGN KEY ("related_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_related_booking_id_lesson_bookings_id_fk" FOREIGN KEY ("related_booking_id") REFERENCES "public"."lesson_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_emails" ADD CONSTRAINT "user_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_type_created_at_idx" ON "events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "events_actor_created_at_idx" ON "events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");