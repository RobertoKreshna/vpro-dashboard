const MAX_SIDE = 1600;
const QUALITY = 0.82;
/** Below this a photo is already small enough; re-encoding would only cost quality. */
const SKIP_BELOW = 300 * 1024;

/**
 * Shrinks a photo in the browser before upload (longest side 1600px, JPEG). Phone photos are 3-8 MB; listing pages
 * never show them larger than ~1000px. Returns the original file whenever resizing isn't possible or doesn't help
 * (GIF/SVG, tiny files, decode errors, or a result that isn't smaller), so an upload never fails because of this.
 */
export async function resizeImage(file: File): Promise<File> {
  try {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size < SKIP_BELOW) return file;
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // JPEG has no transparency
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    if (!blob || blob.type !== "image/jpeg" || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
