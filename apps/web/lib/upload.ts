import type { MediaItem, UploadRequest } from "@livepeer/api-client";

import { requestUploadAction } from "./actions";

/** The nearest of the three shapes to a picture, so its tile isn't cropped more than it has to be. */
async function shapeOf(file: File): Promise<UploadRequest["aspect"]> {
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = bitmap.width / bitmap.height;
    bitmap.close();
    return ratio > 1.3 ? "16:9" : ratio < 0.77 ? "9:16" : "1:1";
  } catch {
    return undefined;
  }
}

/**
 * Sends a photo or video from this device to the library: asks where to send it, then sends the file
 * itself. Throws an Error whose message is ready to show.
 */
export async function uploadFile(file: File): Promise<MediaItem> {
  const kind = file.type.startsWith("video/") ? "video" : "image";
  const aspect = kind === "image" ? await shapeOf(file) : undefined;
  const asked = await requestUploadAction({ kind, name: file.name, content_type: file.type, size_bytes: file.size, ...(aspect ? { aspect } : {}) });
  if ("refused" in asked) throw new Error(asked.refused);

  const response = await fetch(asked.ticket.path, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  const body = (await response.json().catch(() => null)) as MediaItem | { error?: { message?: string } } | null;
  if (!response.ok || !body || "error" in body) throw new Error((body && "error" in body && body.error?.message) || "That file didn't upload. Try again.");
  return body as MediaItem;
}
