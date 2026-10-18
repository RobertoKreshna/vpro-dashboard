# V-PRO Property Dashboard

A web app for the V-PRO property agency to manage **listings**, **sales agents** and **closed deals**.
Staff work in a login-protected admin area; one page, the **public Listing Dashboard** (`/listings-public`), is open to everyone.

## What it does

**Public (no login)**
- Map-and-list property browser: a drill-down map (Indonesia → province → city → district → village) beside the matching listings. Hovering a listing highlights it on the map and the other way round; once a district is chosen, each listing is a marker.
- Filters: search, sell/rent, property type, status (*Available* by default; only Available and Reserved are offered, closed deals are never listed), price range slider, bedrooms, bathrooms, city, district, sales code, sort.
- Listing detail page with photo gallery, facilities, agent name and an "Open in Google Maps" link.
- **Share on WhatsApp** (title, price, area and link) and **Copy link** buttons on each listing. On the staff listing page they share the public link.
- Never exposes internal notes, agent phone/email, or anything about deals.

**Staff (login required)**
- **Dashboard** — active listings, deals and deal value this month; a listings map (loaded once it scrolls into view); the **Deal trend** chart (by day for a month, by month for a year or all time; split by total, payment type incl. each bank, or salesperson); **Deal distribution** (sale vs rent and every payment type) and **Top sales codes** for the chosen period.
  - In the *Total* split, Month and Year views compare with last month / last year: a solid blue line against a dashed grey one, an up/down badge, a **Cumulative** / **Daily** (**Monthly** in Year view) switch, and grouped bars with hatched weekends in the daily view. Hovering a day opens a card with both periods and the change.
  - Daily views show the day name above the date and mark Saturdays and Sundays in blue. Clicking a day opens a panel with that day's deals.
- **Listings** — create/edit/delete, photo upload with cover + drag-to-reorder, facilities (add your own), cascading Province → City → District → Village dropdowns, map coordinates, status, internal notes. "Mark as Done Deal" button.
- **Done Deals** — create from a listing (pre-filled, listing status switches to Sold/Rented, back to Available if the deal is deleted) or manually; payment type (Cash / Bank, with ~118 Indonesian banks); commission amount or percentage, split between the agent who listed and the agent who sold (same agent: 60%; two agents: 30% each; the rest is the company's and isn't shown — see `src/lib/commission.ts`); date-range, payment, sales and city filters; totals; **Excel/CSV export**.
- **Activity** — a log of who created, changed (with the fields that changed) or deleted listings, deals and sales codes, filterable by type. Recorded by the server actions in `src/lib/activity.ts`; only changes made after the log was added appear.
- **Sales** (sales codes) — agents CRUD, active/inactive, deletion blocked while listings or deals still use the code.

Rupiah formatting (`Rp. 1.500.000.000,00`) and `dd/mm/yyyy` dates throughout.

## Tech stack

Next.js 16 (App Router, TypeScript) · Drizzle ORM · Supabase (Postgres, Auth, Storage) · Tailwind CSS 4 + shadcn/ui (Base UI) · Plotly (maps and charts) · zod · SheetJS (`xlsx`) · dnd-kit.
Works with **bun** or **npm** (examples use bun; swap `bun run` ↔ `npm run`).

## Quick start

1. Create a Supabase project.
2. `cp .env.example .env.local` and fill it in (see [Environment variables](#environment-variables)).
3. `bun install`
4. `bun run db:migrate` — creates the tables, public views, Row Level Security policies and the `listing-photos` storage bucket.
5. `bun run db:seed` — sample sales codes, ~112 listings and deals. With `SUPABASE_SERVICE_ROLE_KEY` set it also creates a staff login (`SEED_STAFF_EMAIL` / `SEED_STAFF_PASSWORD`, defaulting to `staff@vpro.example` / `ChangeMe123!`). **Change that password.**
   Add more staff with `bun run staff:add someone@vpro.id 'a-long-password'`. A user created only in the Supabase dashboard is **not** staff until you run `staff:add` for them (see [Security](#security)).
6. `bun run dev` → http://localhost:3000 (staff) · http://localhost:3000/listings-public (public).

## Environment variables

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key (browser + server auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server/scripts only** — creating the seed staff user. Never expose it to the browser |
| `DATABASE_URL` | Direct Postgres connection used by Drizzle (pooler or direct URL) |
| `SEED_STAFF_EMAIL`, `SEED_STAFF_PASSWORD` | Optional: login created by `db:seed` |

## Deploying to Vercel

1. Import the project; Vercel detects Next.js (no `vercel.json` needed). Use Node 22 (Project Settings → General).
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `DATABASE_URL`. Leave `SUPABASE_SERVICE_ROLE_KEY` out — only the local staff/seed scripts use it.
3. Use the Supabase **transaction pooler** for `DATABASE_URL` (port `6543`; the direct `db.<ref>.supabase.co` host is IPv6-only and unreachable from Vercel). The client already disables prepared statements and uses one connection per instance on Vercel.
4. Run `db:migrate` from your machine (direct or session-pooler URL, port `5432`), not from the pooler on 6543.
5. In Supabase set the Site URL to the Vercel domain, and add a Vercel Firewall rate-limit rule for `/login` (the built-in limits are per instance).

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` / `build` / `start` | Next.js dev server / production build / serve the build |
| `bun run lint` | ESLint |
| `bun run db:generate` | Generate a Drizzle migration after editing `src/db/schema.ts` |
| `bun run db:migrate` | Apply all migrations in `drizzle/` |
| `bun run db:seed` | Seed a fresh database (add `-- --reset` to wipe and reseed — destructive) |
| `bun run db:seed:more [count] [--city="Kota Makassar"]` | **Append** generated listings + deals; never deletes anything |
| `bun run db:studio` | Drizzle Studio |
| `bun run staff:add <email> [password]` | Create a staff login, or promote an existing user (sets `app_metadata.role = "staff"`) |
| `bun run staff:remove <email>` | Remove staff access from a user |
| `bun run geo:build` | Build map boundary tiles (see below) |

## Data model

Tables: `sales_codes`, `facilities`, `listings`, `listing_photos`, `deals`, `activity_log` (IDs like `LST-0001` / `DL-0001` come from Postgres sequences). Migrations live in `drizzle/`.
Photos live in the public-read `listing-photos` bucket (`<listing-id>/<uuid>.<ext>`); uploads go straight from the browser to Storage (images only, 10 MB max, enforced by the bucket).

## Security

**Who is "staff"?** A Supabase user with `app_metadata.role = "staff"`. That field can only be written with the service-role key, so it can't be self-assigned. The app (`proxy.ts`, `requireUser()`, the login action) *and* the database policies all require it. This matters because **Supabase allows open sign-ups by default**: without the role check, anyone could register and get full access.

| Layer | Protection |
|---|---|
| Database | RLS on every table; the only policy requires the staff role (`0004_staff_only_policies.sql`; `activity_log` is read-only for staff, written only by the server). `anon` has no table access. `TRUNCATE`/`TRIGGER`/`REFERENCES` revoked from API roles. |
| Public data | Public pages read only the `public_listings` / `public_listing_photos` views — no internal notes, agent phone/email or deals. |
| Storage | Anyone can read photos; only staff can write. |
| App | Every server action and the export route call `requireUser()`; server actions get Next's built-in origin (CSRF) check. Inputs are validated with zod; URL filters are whitelisted/clamped; all SQL is parameterised. |
| Login | Per-IP+email and per-IP rate limits, generic error messages, open-redirect-safe `?next=`, non-staff accounts are rejected and signed out. |
| Abuse | In-memory rate limits on login, public pages (240/min/IP) and exports (15/min/user). These are per server instance — also enable platform protection (Vercel Firewall, Cloudflare). |
| Exports | Cells starting with `= + - @` are neutralised (spreadsheet formula injection). |
| Headers | CSP (no third-party origins: even the Plotly base map is self-hosted in `public/geo/plotly`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production; `X-Powered-By` removed. |
| Dependencies | `npm audit --omit=dev` is clean. `xlsx` is installed from SheetJS's own patched release (the npm copy is stuck on a vulnerable version); the `shadcn` CLI is a dev dependency. |

**Things to know**
- The app connects to Postgres directly (`DATABASE_URL`, the `postgres` role), which **bypasses RLS**. The public pages are safe because the code only queries the two public views — keep it that way. (Hardening idea: a dedicated low-privilege role for the public read path.)
- On Supabase the views are created with `security_invoker`, so `anon` cannot read them through the REST API either. That is fine: the app never uses the REST API for data, and the service-role key is only used by the seed/staff scripts. It must **never** be exposed to the browser or given a `NEXT_PUBLIC_` name.
- Supabase's `listing-photos` bucket is public by design (listing photos are public).

**Supabase dashboard checklist (not settable from code)**
1. Authentication → Sign In / Providers → turn **off** "Allow new users to sign up". (The staff-role check already blocks sign-ups from the app and database, but there is no reason to leave it open.)
2. Authentication → Policies/Sign-in: raise the minimum password length (12+), and enable leaked-password protection if your plan has it. Consider MFA for staff.
3. Rotate any key or password that has been pasted into chat/tickets (database password, service-role key). The publishable (anon) key is public by design.
4. Set the site URL and redirect URLs to your real domain once deployed.
5. Keep `.env.local` out of git (it is ignored) and use your host's secret store in production.

## Map & location data

The map and the location dropdowns use boundary tiles in `public/geo` (generated, ~20 MB):

| Level | Source | Notes |
|---|---|---|
| Provinces, cities/regencies, districts, villages (names) | [cahyadsn/wilayah_boundaries](https://github.com/cahyadsn/wilayah_boundaries) — MIT, 2025 codes | Whole country; village *names* for all 514 cities, village *shapes* only where built |
| Districts + villages for cities that have listings | **BIG** (Badan Informasi Geospasial) 1:10,000 via its public ArcGIS service | ~60× more detail; used when available, base data otherwise |

```bash
bun run geo:build                          # everything above (cities with listings get village shapes + BIG detail)
bun run geo:build --city="Kota Manado"     # also build village shapes for a specific city
bun run geo:build --villages=all           # village shapes for every city (very large)
bun run geo:build --no-big                 # skip the BIG upgrade (don't mix with a later partial run: it overwrites the BIG tiles)
bun run geo:build --force                  # rebuild existing files
```

**Re-run `geo:build` after adding listings in a new city**, otherwise that city's village level says its boundaries aren't installed (the form's village dropdown still works from the names list).
Listing region names must match the official names (e.g. *Kota Bandung* ≠ the Bandung regency *Bandung*); anything that doesn't match is listed under the map instead of silently dropped.
Boundary data is from 2020–2025 and newer regions may be missing. BIG requires attribution (shown in the public footer) and publishes no explicit licence text — confirm its terms before relying on it commercially. The MIT-licensed base data is the safe fallback (`--no-big`).

## Sample data

```bash
bun run db:seed                                   # 12 hand-written + 100 generated listings, deals (cash/bank mix)
bun run db:seed:more 40 --city="Kota Makassar"    # add 40 more in one city (names must match scripts/seed-bulk.ts)
```
Generated listings get coordinates inside their own village polygon (run `geo:build` first). Sample listings have no photos.

## Project structure

```
src/
  app/
    (staff)/            dashboard, listings, deals, sales-codes, activity (login required)
    listings-public/    public map + list, listing detail
    login/              sign-in page + server actions
  components/
    listings/           map, filters, forms, photo manager, place pickers
    deals/  dashboard/  sales/  common/  layout/  ui/ (shadcn)
  db/                   Drizzle schema + client
  lib/                  queries, formatting, commission split, activity log, dashboard cache and chart helpers, geo name matching, Supabase clients
  proxy.ts              auth redirect (Next 16 "proxy")
drizzle/                SQL migrations
scripts/                migrate, seed, seed-more, build-geo, helpers
public/geo/             generated boundary tiles
```

## Notes

- Brand: text mark **V-PRO**; palette — blue `#4AA8DE`, light blue `#A9D6F0`, yellow `#E8C12E` (accent only), text `#1F2937`. White text on the lighter blue is below the usual contrast guideline, so primary buttons use semi-bold text.
- `AGENTS.md` / `CLAUDE.md` come from the Next.js template and point at the bundled Next.js docs in `node_modules/next/dist/docs/`.
- Dashboard queries (map, stats, chart, distribution, top sales) are cached for 60 seconds (`src/lib/dashboard-cache.ts`, built on `unstable_cache`), so switching the chart split doesn't re-run them. Any server action that writes listings, deals or sales codes must call `invalidateDashboard()`. Changes made straight in the database, or by the seed scripts, can take up to a minute to show.
- Node 20 works but Supabase's client warns that Node 22+ will be required in future.

## Credits

Boundaries: [cahyadsn/wilayah_boundaries](https://github.com/cahyadsn/wilayah_boundaries) (MIT) · Badan Informasi Geospasial (BIG). Maps and charts: Plotly.

## Telegram listing intake

Staff paste a WhatsApp listing into a Telegram bot; a free built-in parser (or Claude, if you set `ANTHROPIC_API_KEY`) turns it into a draft; a human reviews it on the **Drafts** page and saves it as a real listing.

1. Create a bot with [@BotFather](https://t.me/BotFather). In BotFather run `/setjoingroups` → **Disable**, since the bot only works in private chats. Fill the `TELEGRAM_*` values in `.env.local` (see `.env.example`). `ANTHROPIC_API_KEY` is optional; if you use it, set a monthly spend limit in the Anthropic console.
2. Run `bun run db:migrate` to create the `listing_drafts` table.
3. Deploy (or tunnel with ngrok), then run `bun run telegram:setup https://YOUR-PUBLIC-ADDRESS`. It checks the token, registers the webhook (with the secret and `allowed_updates=["message"]`), sets the bot's command menu and description, and prints the status. Re-run it whenever the address changes (a free ngrok address changes on every restart).
4. **Who can use the bot:** manage it on the dashboard's **Telegram** page. Enter a person's numeric Telegram user ID and a username or name (just a label), and click Add; Remove cuts access immediately, with no redeploy. Someone not yet added can message the bot and it replies with their ID to send to an admin. Drafts show the name you entered. `TELEGRAM_ALLOWED_USER_IDS` is an optional backup list that also works.
5. Staff can send text, photos, or both (an album with a caption works too), as photos or as image files. Photos are stored in the `listing-photos` bucket and moved under the listing's own folder when a draft is approved. This needs `SUPABASE_SERVICE_ROLE_KEY` on the server.
6. **Bot commands:** `/help` explains the flow, `/drafts` lists your drafts waiting for review, `/cancel` discards the draft you just sent (and its photos). Anyone not on the allowed list gets nothing but their own ID.
7. Drafts nobody reviews are deleted, with their photos, after 30 days (cleaned up whenever someone opens the Drafts page).

Security notes: anything under `/api/telegram/` is public (it authenticates by the webhook secret), so a route added there must check its own auth. If the bot token ever leaks, revoke it in BotFather. `TELEGRAM_API_BASE` is a test-only override and is ignored in production.
