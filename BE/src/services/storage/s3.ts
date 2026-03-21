import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
      throw new Error("Missing R2_ACCOUNT_ID");
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
  return uploadObject(buffer, key, contentType);
}

export async function uploadObject(buffer: Buffer, key: string, contentType: string) {
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


export async function deleteObjects(keys: string[]) {
  const uniqueKeys = Array.from(new Set(keys.map((key) => String(key || "").trim()).filter(Boolean)));
  if (uniqueKeys.length === 0) return 0;
  if (!R2_BUCKET) {
    console.error("Missing R2_BUCKET");
    throw new Error("Missing R2_BUCKET");
  }

  const s3 = getClient();
  let deletedCount = 0;
  for (let index = 0; index < uniqueKeys.length; index += 1000) {
    const batch = uniqueKeys.slice(index, index + 1000);
    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: {
          Objects: batch.map((key) => ({ Key: key })),
          Quiet: true
        }
      })
    );
    deletedCount += Array.isArray(result.Deleted) ? result.Deleted.length : 0;
  }

  return deletedCount;
}
