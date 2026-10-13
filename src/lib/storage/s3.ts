import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { photoRoot } from "@/lib/consultations/photos";

let s3ClientInstance: S3Client | null = null;

export function getS3Config() {
  const bucket = (
    process.env.AWS_S3_BUCKET ||
    process.env.S3_BUCKET_NAME ||
    process.env.AWS_BUCKET ||
    ""
  ).trim();
  const region = (
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "ap-southeast-1"
  ).trim();
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  const endpoint = (
    process.env.AWS_ENDPOINT_URL_S3 ||
    process.env.AWS_ENDPOINT ||
    process.env.S3_ENDPOINT ||
    ""
  ).trim() || undefined;

  const isConfigured = Boolean(bucket && accessKeyId && secretAccessKey);
  return { bucket, region, accessKeyId, secretAccessKey, endpoint, isConfigured };
}

export function getS3Client(): S3Client | null {
  const config = getS3Config();
  if (!config.isConfigured) return null;
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint
        ? { endpoint: config.endpoint, forcePathStyle: true }
        : {}),
    });
  }
  return s3ClientInstance;
}

export async function saveStorageFile(
  filename: string,
  buffer: Buffer,
  mimeType: string,
  prefix = "photos",
): Promise<{ key: string; s3: boolean }> {
  const config = getS3Config();
  const s3 = getS3Client();

  if (config.isConfigured && s3) {
    const s3Key = prefix ? `${prefix}/${filename}` : filename;
    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    // Optional local cache
    try {
      const localDir = photoRoot();
      await mkdir(localDir, { recursive: true, mode: 0o700 });
      await writeFile(path.join(localDir, filename), buffer, { mode: 0o600 });
    } catch {
      // Local caching failure is non-fatal if S3 succeeded
    }
    return { key: s3Key, s3: true };
  }

  // Fallback to local disk
  const localDir = photoRoot();
  await mkdir(localDir, { recursive: true, mode: 0o700 });
  const dest = path.join(localDir, filename);
  await writeFile(dest, buffer, { mode: 0o600 });
  return { key: filename, s3: false };
}

export async function readStorageFile(
  filename: string,
  prefix = "photos",
): Promise<{ bytes: Buffer; fromS3: boolean } | null> {
  const config = getS3Config();
  const s3 = getS3Client();

  if (config.isConfigured && s3) {
    const s3Key = prefix ? `${prefix}/${filename}` : filename;
    try {
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: s3Key,
        }),
      );
      if (response.Body) {
        const streamToBuffer = async (stream: any): Promise<Buffer> => {
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
          }
          return Buffer.concat(chunks);
        };
        const bytes = await streamToBuffer(response.Body);
        return { bytes, fromS3: true };
      }
    } catch {
      // Try root key if prefixed key was not found
    }

    if (prefix) {
      try {
        const response = await s3.send(
          new GetObjectCommand({
            Bucket: config.bucket,
            Key: filename,
          }),
        );
        if (response.Body) {
          const streamToBuffer = async (stream: any): Promise<Buffer> => {
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
              chunks.push(Buffer.from(chunk));
            }
            return Buffer.concat(chunks);
          };
          const bytes = await streamToBuffer(response.Body);
          return { bytes, fromS3: true };
        }
      } catch {}
    }
  }

  // Fallback to local filesystem
  try {
    const filePath = path.join(photoRoot(), filename);
    const bytes = await readFile(filePath);
    return { bytes, fromS3: false };
  } catch {
    return null;
  }
}

export async function deleteStorageFile(
  filename: string,
  prefix = "photos",
): Promise<void> {
  const config = getS3Config();
  const s3 = getS3Client();

  if (config.isConfigured && s3) {
    const s3Key = prefix ? `${prefix}/${filename}` : filename;
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: s3Key,
        }),
      );
    } catch {}
  }

  try {
    const filePath = path.join(photoRoot(), filename);
    await unlink(filePath);
  } catch {}
}
