CREATE TABLE "listing_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_text" text NOT NULL,
	"parsed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_by" text,
	"telegram_chat_id" bigint,
	"telegram_message_id" bigint,
	"telegram_media_group_id" text,
	"photos" text[] DEFAULT '{}'::text[] NOT NULL,
	"listing_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_drafts" ADD CONSTRAINT "listing_drafts_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "listing_drafts_status_idx" ON "listing_drafts" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_drafts_telegram_msg_idx" ON "listing_drafts" USING btree ("telegram_chat_id","telegram_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_drafts_media_group_idx" ON "listing_drafts" USING btree ("telegram_media_group_id");--> statement-breakpoint
ALTER TABLE "listing_drafts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Written and read only by the app's server (direct connection); the API roles get no access.
REVOKE ALL ON public.listing_drafts FROM anon, authenticated;
