import { z } from "zod";

export const TELEGRAM_ID = /^\d{5,15}$/;

const schema = z.object({
  telegramUserId: z.string().regex(TELEGRAM_ID, "Enter the numeric Telegram ID (digits only, e.g. 8585489236)"),
  // A display label for staff: a Telegram @username or a person's name.
  username: z
    .string()
    .min(1, "Enter a username or name")
    .max(64, "Max 64 characters")
    .regex(/^[\p{L}\p{N} ._-]+$/u, "Use letters, numbers, spaces, . _ or - only"),
});

/** Cleans and validates the two inputs of the "add Telegram user" form. */
export function parseTelegramUserInput(idRaw: unknown, nameRaw: unknown):
  | { ok: true; id: number; username: string }
  | { ok: false; errors: Record<string, string> } {
  const parsed = schema.safeParse({
    telegramUserId: String(idRaw ?? "").trim(),
    username: String(nameRaw ?? "").trim().replace(/^@+/, "").trim(),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { ok: false, errors };
  }
  return { ok: true, id: Number(parsed.data.telegramUserId), username: parsed.data.username };
}
