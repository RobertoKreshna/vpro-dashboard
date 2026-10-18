import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { listingDrafts } from "@/db/schema";
import { extractListing, type DraftFields } from "@/lib/draft-extract";
import { rateLimit } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/site";
import { deletePhotosAsService, uploadPhotoAsService } from "@/lib/supabase/admin";
import { downloadFile, reply, sniffImage } from "@/lib/telegram";

type TgMessage = {
  message_id: number;
  chat: { id: number; type?: string };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  caption?: string;
  photo?: { file_id: string; width: number; height: number }[];
  /** Images sent "as a file" (uncompressed) arrive here instead of in `photo`. */
  document?: { file_id: string; mime_type?: string; file_size?: number };
  media_group_id?: string;
};

const MAX_PHOTOS = 20;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // the storage bucket's limit
const ALLOWED_CLAIMS = ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** A lone photo or text joins the sender's latest draft if it was created this recently. */
const JOIN_WINDOW_MS = 15 * 60_000;

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function summary(f: DraftFields) {
  const price = f.price ? `Rp ${f.price.toLocaleString("id-ID")}` : "price ?";
  return [
    f.title ?? "Untitled",
    `${f.listingType ?? "?"} · ${f.propertyType ?? "?"} · ${price}`,
    [f.district, f.city].filter(Boolean).join(", ") || "location ?",
  ].join("\n");
}

/** A link staff can open on their phone, only when the app has a real public address configured. */
const dashboardLink = () =>
  process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL ? `\n${siteUrl()}/drafts` : "";

const HELP = () => `👋 How this works
1. Copy a listing from WhatsApp and paste it here. Photos are optional: send them right after.
2. I turn it into a draft.
3. A teammate reviews it in the dashboard and saves it as a listing.

Commands
/drafts – drafts waiting for review
/cancel – discard the draft you just sent
/help – show this again${dashboardLink() ? `\n\nReview drafts here:${dashboardLink()}` : ""}`;

const ago = (d: Date) => {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60_000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

async function handleCommand(msg: TgMessage, text: string) {
  const chatId = msg.chat.id;
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@\w+$/, "");

  if (cmd === "/start" || cmd === "/help") return reply(chatId, HELP());

  if (cmd === "/drafts") {
    const mine = await db
      .select()
      .from(listingDrafts)
      .where(and(eq(listingDrafts.telegramChatId, chatId), eq(listingDrafts.status, "pending")))
      .orderBy(desc(listingDrafts.createdAt))
      .limit(5);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(listingDrafts).where(eq(listingDrafts.status, "pending"));
    if (!mine.length) return reply(chatId, `You have no drafts waiting. Paste a listing to start.\n\nWaiting for review team-wide: ${n}${dashboardLink()}`);
    const lines = mine.map((d, i) => {
      const f = d.parsed as Partial<DraftFields>;
      return `${i + 1}. ${f.title ?? (d.rawText ? "Untitled" : "(photos only, no text yet)")} · ${d.photos.length} photo(s) · ${ago(d.createdAt)}`;
    });
    return reply(chatId, `📋 Your drafts waiting for review:\n${lines.join("\n")}\n\nWaiting team-wide: ${n}${dashboardLink()}`);
  }

  if (cmd === "/cancel") {
    const [latest] = await db
      .select()
      .from(listingDrafts)
      .where(and(eq(listingDrafts.telegramChatId, chatId), eq(listingDrafts.status, "pending")))
      .orderBy(desc(listingDrafts.createdAt))
      .limit(1);
    if (!latest) return reply(chatId, "Nothing to cancel: you have no drafts waiting.");
    // Claim first so a double /cancel (or a staff member approving at the same moment) can't act twice.
    const [claimed] = await db
      .update(listingDrafts)
      .set({ status: "discarded" })
      .where(and(eq(listingDrafts.id, latest.id), eq(listingDrafts.status, "pending")))
      .returning({ photos: listingDrafts.photos });
    if (!claimed) return reply(chatId, "That draft was already handled by someone else.");
    await deletePhotosAsService(claimed.photos).catch((e) => console.error("cancel: photo delete failed", e));
    const f = latest.parsed as Partial<DraftFields>;
    return reply(chatId, `🗑 Discarded: ${f.title ?? "your last draft"} (${claimed.photos.length} photo(s) removed).`);
  }

  return reply(chatId, "I don't know that command. Send /help to see what I can do.");
}

const submitter = (from: NonNullable<TgMessage["from"]>) =>
  from.username ? `@${from.username}` : (from.first_name ?? String(from.id));

async function latestRecentDraft(chatId: number) {
  const [row] = await db
    .select()
    .from(listingDrafts)
    .where(and(
      eq(listingDrafts.telegramChatId, chatId),
      eq(listingDrafts.status, "pending"),
      gt(listingDrafts.createdAt, new Date(Date.now() - JOIN_WINDOW_MS)),
    ))
    .orderBy(desc(listingDrafts.createdAt))
    .limit(1);
  return row;
}

/** Fills a draft's text and parsed fields, and tells the sender what was read. */
async function setDraftText(draftId: string, raw: string, chatId: number, replyTo: number, intro: string) {
  const fields = await extractListing(raw);
  await db.update(listingDrafts).set({ rawText: raw, parsed: fields }).where(eq(listingDrafts.id, draftId));
  const unsure = fields.uncertain.length ? `\n\n⚠ Check: ${fields.uncertain.join(", ")}` : "";
  await reply(chatId, `${intro}\n\n${summary(fields)}${unsure}`, replyTo);
}

/** The image in a message: a compressed photo (largest size) or an image sent as a file. */
function imageOf(msg: TgMessage): { fileId: string; type: string; size?: number } | undefined {
  const photo = msg.photo?.at(-1);
  if (photo) return { fileId: photo.file_id, type: "image/jpeg" };
  const doc = msg.document;
  if (doc?.mime_type?.startsWith("image/")) return { fileId: doc.file_id, type: doc.mime_type, size: doc.file_size };
  return undefined;
}

async function handlePhoto(msg: TgMessage, caption: string | undefined, image: NonNullable<ReturnType<typeof imageOf>>) {
  const chatId = msg.chat.id;
  const from = msg.from!;
  const group = msg.media_group_id;
  if (!ALLOWED_CLAIMS.includes(image.type) || (image.size ?? 0) > MAX_IMAGE_BYTES) {
    await reply(chatId, "That image can't be used: send JPG, PNG, WebP or GIF under 10 MB.", msg.message_id);
    return;
  }

  // 1. Find the draft this photo belongs to: same album, else the sender's latest recent draft (when no caption).
  let draft = group
    ? (await db.select().from(listingDrafts).where(eq(listingDrafts.telegramMediaGroupId, group)))[0]
    : !caption ? await latestRecentDraft(chatId) : undefined;

  let created = false;
  if (!draft) {
    const [row] = await db
      .insert(listingDrafts)
      .values({
        rawText: "",
        submittedBy: submitter(from),
        telegramChatId: chatId,
        telegramMessageId: msg.message_id,
        telegramMediaGroupId: group ?? null,
      })
      .onConflictDoNothing()
      .returning();
    created = !!row;
    // Another photo of the same album won the race: join its draft.
    draft = row ?? (group ? (await db.select().from(listingDrafts).where(eq(listingDrafts.telegramMediaGroupId, group)))[0] : undefined);
    if (!draft) return; // Telegram retry of a message we already stored
  }
  if (draft.photos.length >= MAX_PHOTOS) {
    await reply(chatId, `Only ${MAX_PHOTOS} photos per listing; extra photos were skipped.`, msg.message_id);
    return;
  }

  // 2. Download, check the bytes really are an image of an allowed kind, store, then append the path to the draft.
  const bytes = await downloadFile(image.fileId);
  const real = bytes.length <= MAX_IMAGE_BYTES ? sniffImage(bytes) : null;
  if (!real) {
    await reply(chatId, "That file isn't a valid JPG, PNG, WebP or GIF under 10 MB.", msg.message_id);
    return;
  }
  const path = `drafts/${draft.id}/${crypto.randomUUID()}.${real.ext}`;
  await uploadPhotoAsService(path, bytes, real.type);
  const [updated] = await db
    .update(listingDrafts)
    .set({ photos: sql`array_append(${listingDrafts.photos}, ${path})` })
    .where(eq(listingDrafts.id, draft.id))
    .returning({ photos: listingDrafts.photos, rawText: listingDrafts.rawText });

  // 3. Caption = the listing text (only the first captioned photo of an album carries it).
  if (caption && !updated.rawText) {
    await setDraftText(draft.id, caption, chatId, msg.message_id, `✅ Draft saved with ${updated.photos.length} photo(s), waiting for review.\nSend more photos to add them, or /cancel to discard.`);
  } else if (created || !group) {
    await reply(chatId, `📷 Photo saved (${updated.photos.length}). ${updated.rawText ? "" : "Now paste the listing text. "}Send more photos if you have them, or /cancel to discard.`, msg.message_id);
  }
}

async function handleText(msg: TgMessage, raw: string) {
  const chatId = msg.chat.id;
  // Photos were sent first and are still waiting for their text: attach the text to that draft.
  const waiting = await latestRecentDraft(chatId);
  if (waiting && !waiting.rawText) {
    await setDraftText(waiting.id, raw, chatId, msg.message_id, `✅ Draft saved with ${waiting.photos.length} photo(s), waiting for review.\nSend more photos to add them, or /cancel to discard.`);
    return;
  }
  const [row] = await db
    .insert(listingDrafts)
    .values({
      rawText: raw,
      submittedBy: submitter(msg.from!),
      telegramChatId: chatId,
      telegramMessageId: msg.message_id,
    })
    .onConflictDoNothing() // Telegram retried a delivery we already handled
    .returning({ id: listingDrafts.id });
  if (row) await setDraftText(row.id, raw, chatId, msg.message_id, "✅ Draft saved, waiting for review.\nNext: send the photos now to attach them (optional), or /cancel to discard it.");
}

/** Telegram webhook: a staff member sends a WhatsApp listing (text and/or photos); we turn it into a draft for review. */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !safeEqual(request.headers.get("x-telegram-bot-api-secret-token") ?? "", secret)) {
    return new Response("forbidden", { status: 403 });
  }

  const update = (await request.json().catch(() => null)) as { message?: TgMessage } | null;
  const msg = update?.message;
  const text = (msg?.text ?? msg?.caption)?.trim() || undefined;
  const image = msg && imageOf(msg);
  if (!msg || (!text && !image)) return Response.json({ ok: true }); // edits, stickers, other files, ...

  // Private chats only: a lone photo/text joins "the sender's latest draft", which is only unambiguous 1:1.
  if (msg.chat.type !== "private") {
    if (rateLimit(`tg-group:${msg.chat.id}`, 1, 3_600_000).ok) await reply(msg.chat.id, "Please message me privately; I don't work in groups.");
    return Response.json({ ok: true });
  }

  // Several staff can use the bot: list all their Telegram user IDs, comma-separated.
  const allowed = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!msg.from || !allowed.includes(String(msg.from.id))) {
    // Strangers get at most 3 replies an hour, then silence.
    if (rateLimit(`tg-deny:${msg.from?.id ?? msg.chat.id}`, 3, 3_600_000).ok) {
      await reply(msg.chat.id, `Not authorised. Ask an admin to add your Telegram ID: ${msg.from?.id ?? "unknown"}`);
    }
    return Response.json({ ok: true });
  }
  if (!image && text?.startsWith("/")) {
    try {
      await handleCommand(msg, text);
    } catch (e) {
      console.error("telegram command failed", e);
      await reply(msg.chat.id, "❌ Something went wrong. Please try again.");
    }
    return Response.json({ ok: true });
  }
  // Generous (an album is one request per photo), and only the first rejection in a window gets a reply.
  if (!rateLimit(`tg:${msg.from.id}`, 240, 60_000).ok) {
    if (rateLimit(`tg-warn:${msg.from.id}`, 1, 60_000).ok) await reply(msg.chat.id, "Slow down a little, try again in a minute.", msg.message_id);
    return Response.json({ ok: true });
  }

  try {
    if (image) await handlePhoto(msg, text, image);
    else await handleText(msg, text!);
  } catch (e) {
    console.error("telegram draft failed", e);
    await reply(msg.chat.id, "❌ Couldn't process that message. Please try again.", msg.message_id);
  }
  return Response.json({ ok: true });
}
