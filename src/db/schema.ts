import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  pgView,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const listingTypeEnum = pgEnum("listing_type", ["sell", "rent"]);
export const rentalPeriodEnum = pgEnum("rental_period", ["month", "year"]);
export const listingStatusEnum = pgEnum("listing_status", [
  "available",
  "reserved",
  "sold",
  "rented",
]);
export const propertyTypeEnum = pgEnum("property_type", [
  "house",
  "apartment",
  "land",
  "ruko",
  "office",
  "warehouse",
  "villa",
  "other",
]);
export const dealTypeEnum = pgEnum("deal_type", ["sale", "rent"]);
export const paymentTypeEnum = pgEnum("payment_type", ["cash", "bank"]);
export const dealSourceEnum = pgEnum("deal_source", ["listing", "manual"]);

export const listingSeq = pgSequence("listing_seq", { startWith: 1 });
export const dealSeq = pgSequence("deal_seq", { startWith: 1 });

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const salesCodes = pgTable("sales_codes", {
  code: text("code").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const facilities = pgTable("facilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
});

export const listings = pgTable(
  "listings",
  {
    id: text("id")
      .primaryKey()
      .default(sql`'LST-' || lpad(nextval('listing_seq')::text, 4, '0')`),
    title: text("title").notNull(),
    listingType: listingTypeEnum("listing_type").notNull(),
    price: bigint("price", { mode: "number" }).notNull(),
    rentalPeriod: rentalPeriodEnum("rental_period"),
    propertyType: propertyTypeEnum("property_type").notNull(),
    address: text("address").notNull(),
    village: text("village").notNull(),
    district: text("district").notNull(),
    city: text("city").notNull(),
    province: text("province").notNull(),
    postalCode: text("postal_code"),
    landArea: numeric("land_area", { precision: 12, scale: 2, mode: "number" }),
    buildingArea: numeric("building_area", { precision: 12, scale: 2, mode: "number" }),
    bedrooms: integer("bedrooms").notNull().default(0),
    bathrooms: integer("bathrooms").notNull().default(0),
    facilities: text("facilities").array().notNull().default(sql`'{}'::text[]`),
    electricityWatts: integer("electricity_watts"),
    latitude: numeric("latitude", { precision: 9, scale: 6, mode: "number" }),
    longitude: numeric("longitude", { precision: 9, scale: 6, mode: "number" }),
    salesCode: text("sales_code")
      .notNull()
      .references(() => salesCodes.code, { onUpdate: "cascade", onDelete: "restrict" }),
    status: listingStatusEnum("status").notNull().default("available"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("listings_status_idx").on(t.status),
    index("listings_city_idx").on(t.city),
    index("listings_sales_code_idx").on(t.salesCode),
  ],
);

export const listingPhotos = pgTable(
  "listing_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade", onUpdate: "cascade" }),
    path: text("path").notNull(),
    position: integer("position").notNull().default(0),
    isCover: boolean("is_cover").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("listing_photos_listing_idx").on(t.listingId)],
);

export const deals = pgTable(
  "deals",
  {
    id: text("id")
      .primaryKey()
      .default(sql`'DL-' || lpad(nextval('deal_seq')::text, 4, '0')`),
    listingId: text("listing_id").references(() => listings.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    source: dealSourceEnum("source").notNull(),
    dealType: dealTypeEnum("deal_type").notNull(),
    propertyType: propertyTypeEnum("property_type").notNull(),
    address: text("address").notNull(),
    village: text("village"),
    district: text("district"),
    city: text("city").notNull(),
    province: text("province"),
    listingPrice: bigint("listing_price", { mode: "number" }),
    finalPrice: bigint("final_price", { mode: "number" }).notNull(),
    dealDate: date("deal_date", { mode: "string" }).notNull(),
    buyerName: text("buyer_name").notNull(),
    buyerPhone: text("buyer_phone"),
    contractStart: date("contract_start", { mode: "string" }),
    contractEnd: date("contract_end", { mode: "string" }),
    salesCode: text("sales_code")
      .notNull()
      .references(() => salesCodes.code, { onUpdate: "cascade", onDelete: "restrict" }),
    // Who held the listing. Differs from salesCode (who sold it) when two agents shared the deal. Null = same agent.
    listingSalesCode: text("listing_sales_code").references(() => salesCodes.code, { onUpdate: "cascade", onDelete: "restrict" }),
    commissionPercent: numeric("commission_percent", { precision: 6, scale: 3, mode: "number" }),
    commissionAmount: bigint("commission_amount", { mode: "number" }),
    // Nullable only because deals created before this column existed have no recorded payment type.
    paymentType: paymentTypeEnum("payment_type"),
    bankName: text("bank_name"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("deals_date_idx").on(t.dealDate),
    index("deals_listing_idx").on(t.listingId),
    index("deals_sales_code_idx").on(t.salesCode),
  ],
);

/**
 * Public, read-only views (created in the custom SQL migration). They expose
 * no internal notes, no agent phone/email and nothing about deals.
 */
export const publicListings = pgView("public_listings", {
  id: text("id").notNull(),
  title: text("title").notNull(),
  listingType: listingTypeEnum("listing_type").notNull(),
  price: bigint("price", { mode: "number" }).notNull(),
  rentalPeriod: rentalPeriodEnum("rental_period"),
  propertyType: propertyTypeEnum("property_type").notNull(),
  address: text("address").notNull(),
  village: text("village").notNull(),
  district: text("district").notNull(),
  city: text("city").notNull(),
  province: text("province").notNull(),
  postalCode: text("postal_code"),
  landArea: numeric("land_area", { mode: "number" }),
  buildingArea: numeric("building_area", { mode: "number" }),
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: integer("bathrooms").notNull(),
  facilities: text("facilities").array().notNull(),
  electricityWatts: integer("electricity_watts"),
  salesCode: text("sales_code").notNull(),
  agentName: text("agent_name").notNull(),
  status: listingStatusEnum("status").notNull(),
  coverPath: text("cover_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  latitude: numeric("latitude", { mode: "number" }),
  longitude: numeric("longitude", { mode: "number" }),
}).existing();

export const publicListingPhotos = pgView("public_listing_photos", {
  id: uuid("id").notNull(),
  listingId: text("listing_id").notNull(),
  path: text("path").notNull(),
  position: integer("position").notNull(),
  isCover: boolean("is_cover").notNull(),
}).existing();

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type SalesCode = typeof salesCodes.$inferSelect;
export type ListingPhoto = typeof listingPhotos.$inferSelect;

/** Who changed what. Written by server actions (src/lib/activity.ts); read on the staff Activity page. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary").notNull(),
  },
  (t) => [index("activity_log_at_idx").on(t.at)],
);

/**
 * Listings pasted into the Telegram bot and parsed by Claude, waiting for a human to review them.
 * `parsed` holds the extracted fields (see src/lib/draft-extract.ts); approving one opens the normal listing form.
 */
export const listingDrafts = pgTable(
  "listing_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawText: text("raw_text").notNull(),
    parsed: jsonb("parsed").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("pending"), // pending | approved | discarded
    submittedBy: text("submitted_by"),
    telegramChatId: bigint("telegram_chat_id", { mode: "number" }),
    telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
    /** Telegram groups an album's photos under one id; used to collect them into a single draft. */
    telegramMediaGroupId: text("telegram_media_group_id"),
    /** Storage paths (listing-photos bucket, under drafts/<id>/) of photos sent with the message. */
    photos: text("photos").array().notNull().default(sql`'{}'::text[]`),
    listingId: text("listing_id").references(() => listings.id, { onDelete: "set null", onUpdate: "cascade" }),
    ...timestamps,
  },
  (t) => [
    index("listing_drafts_status_idx").on(t.status, t.createdAt),
    uniqueIndex("listing_drafts_telegram_msg_idx").on(t.telegramChatId, t.telegramMessageId),
    uniqueIndex("listing_drafts_media_group_idx").on(t.telegramMediaGroupId),
  ],
);

/**
 * Telegram accounts allowed to use the listing-intake bot, managed on the staff Telegram page.
 * The numeric ID is what the bot checks; `username` is only a display label for staff.
 */
export const telegramUsers = pgTable("telegram_users", {
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).primaryKey(),
  username: text("username").notNull(),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
