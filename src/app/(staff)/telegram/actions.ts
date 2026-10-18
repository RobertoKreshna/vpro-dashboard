"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { telegramUsers } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { parseTelegramUserInput, TELEGRAM_ID } from "@/lib/telegram-user-input";

export type TelegramUserState = { ok?: boolean; errors?: Record<string, string> };

export async function addTelegramUser(_prev: TelegramUserState, fd: FormData): Promise<TelegramUserState> {
  const user = await requireUser();
  const input = parseTelegramUserInput(fd.get("telegramUserId"), fd.get("username"));
  if (!input.ok) return { errors: input.errors };
  const { id, username } = input;
  try {
    await db.insert(telegramUsers).values({ telegramUserId: id, username, addedBy: user.email ?? null });
  } catch (e) {
    if (String((e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code) === "23505") {
      return { errors: { telegramUserId: "This Telegram ID is already added" } };
    }
    throw e;
  }
  await logActivity({ actor: user.email, action: "created", entity: "telegram_user", entityId: String(id), summary: `${username} allowed to use the bot` });
  revalidatePath("/telegram");
  return { ok: true };
}

export async function removeTelegramUser(id: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!TELEGRAM_ID.test(id)) return { error: "Invalid Telegram ID" };
  const [gone] = await db.delete(telegramUsers).where(eq(telegramUsers.telegramUserId, Number(id))).returning({ username: telegramUsers.username });
  if (gone) await logActivity({ actor: user.email, action: "deleted", entity: "telegram_user", entityId: id, summary: `${gone.username} can no longer use the bot` });
  revalidatePath("/telegram");
  return {};
}
