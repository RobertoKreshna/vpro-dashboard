CREATE TABLE "telegram_users" (
	"telegram_user_id" bigint PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Read and written only by the app's server (direct connection); the API roles get no access.
REVOKE ALL ON public.telegram_users FROM anon, authenticated;
