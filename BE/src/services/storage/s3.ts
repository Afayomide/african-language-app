import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "";
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || "";

let client: S3Client | null = null;

function getClient() {
  if (!client) {
    if (!R2_ACCOUNT_ID) {
      console.error("Missing R2_ACCOUNT_ID");
      throw new Error(
        "Missin15aa8a51c11445b784c88e3ecaf3b84cc8d7e7ad05b5d818c0bac50c5bbab28eg R2_ACCOUNT_ID",
      );
    }
    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      console.error("Missing R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY");
      throw new Error("Missing R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY");
    }
    client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

function resolvePublicUrl(key: string) {
  if (R2_PUBLIC_BASE_URL) {
    return `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
  if (!R2_ACCOUNT_ID || !R2_BUCKET) {
    throw new Error("Missing R2_ACCOUNT_ID or R2_BUCKET");
  }
  return `https://${R2_BUCKET}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
}

export async function uploadAudio(buffer: Buffer, key: string, contentType: string) {
  if (!R2_BUCKET) {
    console.error("Missing R2_BUCKET");
    throw new Error("Missing R2_BUCKET");
  }
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return resolvePublicUrl(key);
}
