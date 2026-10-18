import "server-only";
import { PHOTO_BUCKET } from "@/lib/constants";

/**
 * Uploads a file to the photo bucket with the service-role key, for server jobs that have no user session
 * (the Telegram webhook). Plain fetch on purpose: supabase-js needs a WebSocket implementation (Node 22+) at
 * construction time even though storage never uses it. Never import this from client code.
 */
export async function uploadPhotoAsService(path: string, body: Uint8Array, contentType: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": contentType,
      "cache-control": "max-age=31536000",
    },
    body: body as BodyInit,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`photo upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Deletes files from the photo bucket with the service-role key (used by the bot's /cancel). */
export async function deletePhotosAsService(paths: string[]) {
  if (!paths.length) return;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}`, {
    method: "DELETE",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ prefixes: paths }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`photo delete ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
