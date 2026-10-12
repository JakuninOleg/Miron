import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { mediaFolders, publicMediaKey } from "../../src/server/media/public-path";

async function main() {
  if (process.env.APP_RELEASE_CHANNEL !== "beta") throw new Error("Public media bootstrap is beta only");
  const { S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey, S3_BUCKET: bucket } = process.env;
  if (!accessKeyId || !secretAccessKey || !bucket || !/^[a-z0-9-]+$/.test(bucket))
    throw new Error("Public media storage configuration missing");
  const client = new S3Client({
    endpoint: "https://s3.twcstorage.ru", region: "ru-1", forcePathStyle: true, maxAttempts: 2,
    credentials: { accessKeyId, secretAccessKey },
  });
  let uploaded = 0;
  let totalBytes = 0;
  try {
    for (const folder of mediaFolders) {
      for (const name of await readdir(join("public", folder))) {
        const key = publicMediaKey(`${folder}/${name}`);
        if (!key) continue;
        const path = join("public", folder, name);
        const info = await stat(path);
        if (!info.isFile() || info.size > 5_000_000 || totalBytes + info.size > 50_000_000)
          throw new Error("Public media bootstrap size limit exceeded");
        const type = name.endsWith(".svg") ? "image/svg+xml" : name.endsWith(".png") ? "image/png" : name.endsWith(".jpg") ? "image/jpeg" : "image/webp";
        await client.send(new PutObjectCommand({
          Bucket: bucket, Key: key, Body: await readFile(path), ContentType: type,
          CacheControl: "public, max-age=86400",
        }), { abortSignal: AbortSignal.timeout(15000) });
        uploaded++;
        totalBytes += info.size;
      }
    }
    console.log(`Public media uploaded: ${uploaded} objects, ${totalBytes} bytes.`);
  } finally { client.destroy(); }
}
void main().catch(() => {
  console.error("Public media upload failed. Check scoped S3 configuration.");
  process.exitCode = 1;
});
