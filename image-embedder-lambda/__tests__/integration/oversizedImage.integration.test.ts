import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { S3Client } from "@aws-sdk/client-s3";
import { getImageFromS3, embedImage } from "../../src/index";

/**
 * Integration tests for Bedrock embedding with oversized images.
 * 
 * These tests call real AWS services and require:
 * - Valid AWS credentials with S3 and Bedrock permissions
 * - Test images uploaded to the specified S3 bucket
 * 
 * Run with: npm run test:integration
 */

const TEST_BUCKET = "image-embedding-test";

// TODO: Replace with actual key once you upload a >5MB image
// const OVERSIZED_IMAGE_KEY = "large-images/0dc623402c55cb2f9e3617390377b68de83136b3.jpeg"; // 5,069,587 bytes
const OVERSIZED_IMAGE_KEY = "large-images/9743f91fb073d88eb9dcb13d66beacf47919cb3e.jpeg"; // 5,335,376 bytes

describe("Bedrock embedding - oversized images (integration)", () => {
  const s3Client = new S3Client({ region: "eu-west-1" });
  const bedrockClient = new BedrockRuntimeClient({ region: "eu-west-1" });

  it("should fail when embedding an image over 5MB", async () => {
    // 1. Fetch the oversized image from S3
    const imageBytes = await getImageFromS3(TEST_BUCKET, OVERSIZED_IMAGE_KEY, s3Client);
    
    expect(imageBytes).toBeDefined();
    console.log(`Fetched image size: ${imageBytes!.length} bytes (${(imageBytes!.length / (1024 * 1024)).toFixed(2)} MB)`);
    
    // Verify the test image is actually over 5MB
    const FIVE_MB = 5_000_000;
    expect(imageBytes!.length).toBeGreaterThan(FIVE_MB);

    // 2. Convert to base64 data URI (same as production code)
    const base64Image = Buffer.from(imageBytes!).toString('base64');
    const inputImage = `data:image/jpeg;base64,${base64Image}`;

    // 3. Attempt to embed - expect Bedrock to reject with a validation error
    await expect(embedImage([inputImage], bedrockClient))
      .rejects
      .toThrow(); // Bedrock should reject images over 5MB
    
    // Note: The exact error message may vary. Common patterns include:
    // - ValidationException
    // - "payload size" / "image size" / "exceeds maximum"
    // You can make this more specific once you see the actual error format
  });
});
