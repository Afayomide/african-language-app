import crypto from "crypto";
import { uploadObject } from "../../services/storage/s3.js";

export type ParsedImageUpload =
  | { buffer: Buffer; mimeType: string; extension: string }
  | "invalid_image_upload"
  | "image_too_large"
  | null;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg"
};

export function parseImageUpload(imageUpload: unknown): ParsedImageUpload {
  if (imageUpload === undefined) return null;
  if (!imageUpload || typeof imageUpload !== "object") return "invalid_image_upload";

  const payload = imageUpload as { base64?: string; mimeType?: string };
  if (!payload.base64 || typeof payload.base64 !== "string") return "invalid_image_upload";

  const dataUrlMatch = payload.base64.match(/^data:([^;]+).*?base64,(.+)$/);
  const base64Data = dataUrlMatch ? dataUrlMatch[2] : payload.base64;
  const mimeTypeFromDataUrl = dataUrlMatch ? dataUrlMatch[1] : undefined;
  const mimeType =
    typeof payload.mimeType === "string" && payload.mimeType.startsWith("image/")
      ? payload.mimeType
      : mimeTypeFromDataUrl && mimeTypeFromDataUrl.startsWith("image/")
        ? mimeTypeFromDataUrl
        : "";

  if (!mimeType || !EXTENSION_BY_MIME[mimeType]) return "invalid_image_upload";

  try {
    const buffer = Buffer.from(base64Data, "base64");
    if (!buffer.length) return "invalid_image_upload";
    if (buffer.length > 10 * 1024 * 1024) return "image_too_large";
    return {
      buffer,
      mimeType,
      extension: EXTENSION_BY_MIME[mimeType]
    };
  } catch {
    return "invalid_image_upload";
  }
}

export async function uploadImageFile(input: { buffer: Buffer; mimeType: string; extension: string; ownerId: string }) {
  const key = `images/${input.ownerId}/${crypto.randomUUID()}.${input.extension}`;
  const url = await uploadObject(input.buffer, key, input.mimeType);
  return { url, storageKey: key };
}
