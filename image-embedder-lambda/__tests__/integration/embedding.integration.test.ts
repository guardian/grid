import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { S3Client } from "@aws-sdk/client-s3";
import { getImageFromS3, embedImage } from "../../src/index";

/**
 * Integration tests for Bedrock embedding.
 *
 * These tests call real AWS services and require:
 * - Valid AWS credentials with S3 and Bedrock permissions
 * - Test images uploaded to the specified S3 bucket
 *
 * Run with: npm run test:integration
 *
 * Some tests will fail until we implement resizing/conversion.
 */

const TEST_BUCKET = "image-embedding-test";

interface TestImage {
  name: string;
  key: string;
  expectedBytes: number;
  mimeType: "image/jpeg" | "image/png" | "image/tiff";
}

const TEST_IMAGES: TestImage[] = [
  {
    name: "JPEG over 5 MB but just under 5 MiB",
    key: "large-images/aaf514e9530271ab5639bb5f496eef97cdce9b7a.jpeg",
    expectedBytes: 5_242_808,
    mimeType: "image/jpeg",
  },
  {
    name: "JPEG just over 5 MiB",
    key: "large-images/5f8871b3686d06dadf3e7556cca2601c3b276288.jpeg",
    expectedBytes: 5_242_970,
    mimeType: "image/jpeg",
  },
  {
    name: "JPEG over 10 MB",
    key: "large-images/fed92369dbbc961708ab883da815fc4c7f52597e.jpeg",
    expectedBytes: 10_360_979,
    mimeType: "image/jpeg",
  },
  {
    name: "Small PNG",
    key: "pngs/339d129c0b0f47507f7d299bf28046d40c12d368.png",
    expectedBytes: 131_137,
    mimeType: "image/png",
  },
  {
    name: "Large PNG",
    key: "pngs/c2039d7b0ba13910d7f8147128b86199784465ae.png",
    expectedBytes: 16_368_332,
    mimeType: "image/png",
  },
  {
    name: "Small TIFF",
    key: "tiffs/b927f8924960874eda447208baa3fe7963cba8c4.tiff",
    expectedBytes: 1_542_708,
    mimeType: "image/tiff",
  },
  {
    name: "Large TIFF",
    key: "tiffs/7d0b7c7b8e890d7e5d369093aa437bd833e20f71.tiff",
    expectedBytes: 6_038_108,
    mimeType: "image/tiff",
  },
];

describe("Embedding with Cohere v3 via Bedrock", () => {
  const s3Client = new S3Client({ region: "eu-west-1" });
  const bedrockClient = new BedrockRuntimeClient({ region: "eu-west-1" });

  it.each(TEST_IMAGES)("should embed $name", async (image) => {
    const imageBytes = await getImageFromS3(TEST_BUCKET, image.key, s3Client);
    expect(imageBytes).toBeDefined();
    expect(imageBytes.length).toBe(image.expectedBytes);

    const response = await embedImage(imageBytes, image.mimeType, bedrockClient);
    expect(response.$metadata.httpStatusCode).toBe(200);
  });
});
