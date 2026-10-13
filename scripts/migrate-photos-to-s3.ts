import { PrismaClient } from "@prisma/client";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  getS3Config,
  getS3Client,
  saveStorageFile,
} from "../src/lib/storage/s3";
import { imageMime } from "../src/lib/consultations/photos";

const prisma = new PrismaClient();

async function main() {
  const config = getS3Config();
  console.log("Checking S3 configuration...");
  console.log(`Bucket: ${config.bucket || "(not set)"}`);
  console.log(`Region: ${config.region || "(not set)"}`);
  console.log(`Configured: ${config.isConfigured ? "YES" : "NO"}`);

  if (!config.isConfigured) {
    console.error(
      "\nError: AWS S3 is not configured in .env. Please set AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION.",
    );
    process.exit(1);
  }

  const s3 = getS3Client();
  if (!s3) {
    console.error("\nFailed to initialize S3 client.");
    process.exit(1);
  }

  const photoDir = path.join(process.cwd(), ".data", "photos");
  let files: string[] = [];
  try {
    files = await readdir(photoDir);
  } catch (err) {
    console.log(`No local photos directory found at ${photoDir}`);
  }

  console.log(`\nFound ${files.length} local files in ${photoDir}`);

  let uploadedCount = 0;
  for (const filename of files) {
    try {
      const filePath = path.join(photoDir, filename);
      const buffer = await readFile(filePath);
      const mime = imageMime(buffer) || "application/octet-stream";

      // Check if it's in PhotoAsset or PartnerDocument
      const photoAsset = await prisma.photoAsset.findFirst({
        where: { filename },
      });
      const partnerDoc = await prisma.partnerDocument.findFirst({
        where: { filename },
      });

      const prefix = partnerDoc ? "documents" : "photos";
      const mimeType = photoAsset?.mime_type || partnerDoc?.mime_type || mime;

      console.log(`Uploading ${filename} (${prefix}) [${mimeType}]...`);
      await saveStorageFile(filename, buffer, mimeType, prefix);
      uploadedCount++;
      console.log(`  ✓ Uploaded ${filename}`);
    } catch (err: any) {
      console.error(`  ✗ Failed to upload ${filename}:`, err.message);
    }
  }

  console.log(`\nMigration completed: ${uploadedCount}/${files.length} files uploaded to S3.`);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
