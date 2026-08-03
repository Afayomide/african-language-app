import { randomBytes } from "node:crypto";

/**
 * Driver-neutral id helpers.
 *
 * Ids are 24-character ObjectId-compatible hex strings. We kept that format
 * through the Postgres migration so every reference already stored in the data
 * (block refIds, component refIds, question sourceIds, ...) keeps resolving.
 *
 * This lives in utils — not under infrastructure/db — because controllers and
 * validators need `isValidId` and must not depend on a specific database driver.
 */

export function genObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, "0");
  const random = randomBytes(8).toString("hex");
  return timestamp + random;
}

/** Replaces `mongoose.Types.ObjectId.isValid`. */
export function isValidId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}
