// ============================================================================
// Client-side photo compression for /api/detect uploads.
//
// Phone camera photos are routinely 3-12MB. Sent untouched as a base64 data
// URL (~33% larger than the raw bytes) that can exceed Netlify Functions'
// synchronous invocation payload limit (~6MB) -- causing the upload to fail
// with a network/413-style error rather than a clean JSON error. To the user
// that looks like "the AI just isn't working," with no useful message.
// Downscaling + re-encoding as JPEG in the browser, before the photo ever
// leaves the device, keeps every upload comfortably under that limit
// regardless of the source camera's resolution -- and makes the Gemini call
// itself faster (fewer image tokens).
// ============================================================================

const MAX_DIMENSION = 1600; // longest side, px
const INITIAL_QUALITY = 0.82;
const MAX_BYTES = 3_500_000; // raw bytes; base64 (~x1.33) stays well under Netlify's ~6MB cap
const MIN_QUALITY = 0.4;
const QUALITY_STEP = 0.15;
const MAX_QUALITY_ATTEMPTS = 4;

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function dataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(",");
  const base64 = commaIdx === -1 ? dataUrl : dataUrl.slice(commaIdx + 1);
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Downscales + re-encodes an image file to a JPEG data URL small enough to
 * safely POST through a serverless function. Falls back to the original
 * file's raw data URL if anything about compression fails (decode failure,
 * tainted canvas, unsupported format, etc.) -- a compression bug should
 * never be the thing that blocks the upload flow.
 */
export async function compressImageFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode image."));
      el.src = objectUrl;
    });

    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    ctx.drawImage(img, 0, 0, width, height);

    let quality = INITIAL_QUALITY;
    let out = canvas.toDataURL("image/jpeg", quality);
    let attempts = 0;
    while (dataUrlBytes(out) > MAX_BYTES && quality > MIN_QUALITY && attempts < MAX_QUALITY_ATTEMPTS) {
      quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP);
      out = canvas.toDataURL("image/jpeg", quality);
      attempts += 1;
    }
    return out;
  } catch {
    return readFileAsDataUrl(file);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
