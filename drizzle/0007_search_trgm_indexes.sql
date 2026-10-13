-- Trigram indexes so the staff/public "contains" searches (ilike '%text%') don't scan whole tables.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_title_trgm_idx" ON "listings" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_address_trgm_idx" ON "listings" USING gin ("address" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_id_trgm_idx" ON "listings" USING gin ("id" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_buyer_name_trgm_idx" ON "deals" USING gin ("buyer_name" gin_trgm_ops);
