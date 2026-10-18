import "server-only";

/** Tests can point the bot at a local stand-in; the override is ignored in production so the token can't be redirected. */
const BASE = () => (process.env.NODE_ENV !== "production" && process.env.TELEGRAM_API_BASE) || "https://api.telegram.org";
const api = (method: string) => `${BASE()}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export async function reply(chatId: number, text: string, replyTo?: number) {
  await fetch(api("sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_parameters: replyTo ? { message_id: replyTo } : undefined }),
  }).catch((e) => console.error("telegram reply failed", e));
}

/** Downloads a file the user sent (as raw bytes; the caller checks what it really is). */
export async function downloadFile(fileId: string): Promise<Uint8Array> {
  const info = (await (await fetch(api("getFile"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  })).json()) as { ok: boolean; result?: { file_path?: string } };
  const path = info.result?.file_path;
  if (!info.ok || !path) throw new Error("Telegram getFile failed");
  const res = await fetch(`${BASE()}/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${path}`);
  if (!res.ok) throw new Error(`Telegram file download ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** What the bytes really are, from their magic numbers (the type a sender claims isn't trusted). */
export function sniffImage(b: Uint8Array): { type: string; ext: string } | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return { type: "image/jpeg", ext: "jpg" };
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { type: "image/png", ext: "png" };
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return { type: "image/gif", ext: "gif" };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { type: "image/webp", ext: "webp" };
  return null;
}
