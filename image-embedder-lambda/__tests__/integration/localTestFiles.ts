import * as fs from "fs/promises";
import * as path from "path";
import { S3Client } from "@aws-sdk/client-s3";
import { getImageFromS3 } from "../../src/index";

const CACHE_DIR = path.join(__dirname, "test-data", "input");
const OUTPUT_DIR = path.join(__dirname, "test-data", "output");

export async function ensureDirectoriesExist(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

function getCachePath(s3Key: string): string {
  return path.join(CACHE_DIR, s3Key.replace(/\//g, "_"));
}

function getOutputPath(s3Key: string, suffix: string = ""): string {
  const baseName = s3Key.replace(/\//g, "_");
  const ext = path.extname(baseName);
  const name = baseName.slice(0, -ext.length);
  return path.join(OUTPUT_DIR, `${name}${suffix}${ext}`);
}

export async function getTestImage(
  bucket: string,
  s3Key: string,
  s3Client: S3Client,
): Promise<Uint8Array> {
  const cachePath = getCachePath(s3Key);

  try {
    const cached = await fs.readFile(cachePath);
    console.log(`Using cached file: ${cachePath}`);
    return new Uint8Array(cached);
  } catch {
    console.log(`Cache miss, downloading from S3: ${s3Key}`);
    const imageBytes = await getImageFromS3(bucket, s3Key, s3Client);
    if (!imageBytes) {
      throw new Error(`Could not get image ${s3Key} from bucket ${bucket}`);
    }

    await fs.writeFile(cachePath, imageBytes);
    console.log(`Cached to: ${cachePath}`);
    return imageBytes;
  }
}

// Output images are *not* cached,
// because that would defeat the point of the tests
// when the downscaling logic is changed.
export async function writeOutputImage(
  imageBytes: Uint8Array,
  s3Key: string,
  suffix: string = "_output",
): Promise<string> {
  const outputPath = getOutputPath(s3Key, suffix);
  await fs.writeFile(outputPath, imageBytes);
  console.log(`Wrote output to: ${outputPath}`);
  return outputPath;
}
