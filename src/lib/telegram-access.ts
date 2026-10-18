import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramUsers } from "@/db/schema";

/** IDs from the optional TELEGRAM_ALLOWED_USER_IDS setting: a backup list that works even if the table is empty. */
export const envAllowedIds = () =>
  (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s));

/** Who may use the bot: anyone added on the Telegram page, or listed in the env setting. `label` is the display name, if any. */
export async function telegramAccess(userId: number): Promise<{ allowed: boolean; label: string | null }> {
  const [row] = await db.select({ username: telegramUsers.username }).from(telegramUsers).where(eq(telegramUsers.telegramUserId, userId));
  return { allowed: !!row || envAllowedIds().includes(String(userId)), label: row?.username ?? null };
}
