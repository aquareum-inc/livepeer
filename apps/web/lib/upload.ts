import type { MediaItem, UploadRequest } from "@livepeer/api-client";

import { completeUploadAction, requestUploadAction } from "./actions";

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
 * Sends a photo or video from this device to the library: asks where to send it, sends the file itself
 * straight to storage, then says it is there. The file never passes through the app's server, and the
 * address it goes to is its own permission, so nothing of the session is sent with it. Throws an Error whose
 * message is ready to show.
 */
export async function uploadFile(file: File): Promise<MediaItem> {
  const kind = file.type.startsWith("video/") ? "video" : "image";
  const aspect = kind === "image" ? await shapeOf(file) : undefined;
  const asked = await requestUploadAction({ kind, name: file.name, content_type: file.type, size_bytes: file.size, ...(aspect ? { aspect } : {}) });
  if ("refused" in asked) throw new Error(asked.refused);

  const { ticket } = asked;
  const sent = await fetch(ticket.url, { method: ticket.method, body: file, headers: ticket.headers, credentials: "omit" }).catch(() => null);
  if (!sent?.ok) throw new Error("That file didn't upload. Check your connection and try again.");

  const done = await completeUploadAction(ticket.id);
  if ("refused" in done) throw new Error(done.refused);
  return done.item;
}
