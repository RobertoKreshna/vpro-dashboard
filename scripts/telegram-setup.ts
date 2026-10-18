import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

/**
 * One-step Telegram setup: registers the webhook, the "/" command menu and the bot description, then prints the status.
 *
 *   bun run telegram:setup https://your-domain.com        # production
 *   bun run telegram:setup https://abc123.ngrok-free.app  # local testing through a tunnel
 *
 * Re-run it whenever the public address changes (a free ngrok address changes every restart).
 */
const base = process.argv[2]?.replace(/\/+$/, "");
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

const fail = (m: string): never => {
  console.error(`✗ ${m}`);
  process.exit(1);
};
if (!base || !/^https:\/\//.test(base)) fail("Usage: bun run telegram:setup https://your-public-address (must be https)");
if (!token) fail("TELEGRAM_BOT_TOKEN is not set in .env.local");
if (!secret) fail("TELEGRAM_WEBHOOK_SECRET is not set in .env.local");
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret!)) fail("TELEGRAM_WEBHOOK_SECRET may only contain letters, numbers, _ and - (max 256 characters)");
if (!process.env.TELEGRAM_ALLOWED_USER_IDS?.trim()) console.warn("! TELEGRAM_ALLOWED_USER_IDS is empty: nobody will be able to submit listings yet.");

async function call(method: string, body?: object) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json()) as { ok: boolean; description?: string; result?: unknown };
  if (!json.ok) fail(`${method}: ${json.description ?? res.status}`);
  return json.result;
}

const me = (await call("getMe")) as { username: string };
console.log(`✓ Token works: @${me.username}`);

await call("setWebhook", { url: `${base}/api/telegram`, secret_token: secret, allowed_updates: ["message"] });
console.log(`✓ Webhook set: ${base}/api/telegram`);

await call("setMyCommands", {
  commands: [
    { command: "help", description: "How this works" },
    { command: "drafts", description: "Drafts waiting for review" },
    { command: "cancel", description: "Discard the draft you just sent" },
  ],
});
// English is the default; people whose Telegram app is set to Indonesian see the "id" texts instead.
await call("setMyDescription", { description: "Send me a WhatsApp listing (text and photos) and I'll turn it into a draft for the team to review.\n\nCopy the listing text, paste it here, then send the photos. Type /help to see how it works." });
await call("setMyShortDescription", { short_description: "Turn WhatsApp listings into dashboard drafts." });
await call("setMyDescription", { language_code: "id", description: "Kirim iklan properti dari WhatsApp (teks dan foto), lalu saya ubah menjadi draf untuk ditinjau tim.\n\nSalin teks iklan, tempel di sini, lalu kirim fotonya. Ketik /help untuk melihat caranya." });
await call("setMyShortDescription", { language_code: "id", short_description: "Ubah iklan WhatsApp menjadi draf di dashboard." });
console.log("✓ Command menu and descriptions set (English + Indonesian)");

const info = (await call("getWebhookInfo")) as { url: string; pending_update_count: number; last_error_message?: string };
console.log(`✓ Telegram will send messages to: ${info.url}`);
console.log(`  waiting updates: ${info.pending_update_count}${info.last_error_message ? `\n  ! last delivery error: ${info.last_error_message}` : ""}`);
console.log(`\nNow open @${me.username} in Telegram, tap Start, and paste a listing.`);
