import { S3Client } from "@aws-sdk/client-s3";
import { fetchImage, SQSMessageBody } from "../src/index";

const BUCKET = "test-bucket";
const IMAGE_ID = "abc123def456";
const ORIGINAL_KEY = "a/b/c/1/2/3/abc123def456";
const OPTIMISED_KEY = `optimised/${ORIGINAL_KEY}`;

const fakeImageBytes = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes

function makeMessage(
  fileType: string,
  overrides?: Partial<SQSMessageBody>,
): SQSMessageBody {
  return {
    imageId: IMAGE_ID,
    s3Bucket: BUCKET,
    s3Key: ORIGINAL_KEY,
    fileType,
    ...overrides,
  };
}

function mockS3Client(
  responses: Record<string, Uint8Array | "NoSuchKey">,
): S3Client {
  const client = new S3Client({});
  client.send = jest.fn().mockImplementation(async (command) => {
    const key = command.input?.Key as string;
    const result = responses[key];
    if (!result || result === "NoSuchKey") {
      const error = new Error("NoSuchKey");
      error.name = "NoSuchKey";
      throw error;
    }
    return {
      Body: { transformToByteArray: async () => result },
      $metadata: {},
    };
  });
  return client;
}

describe("fetchImage", () => {
  describe("JPEGs", () => {
    it("fetches the original directly", async () => {
      const client = mockS3Client({ [ORIGINAL_KEY]: fakeImageBytes });
      const result = await fetchImage(makeMessage("image/jpeg"), client);

      expect(result.bytes).toBe(fakeImageBytes);
      expect(result.mimeType).toBe("image/jpeg");
      expect(client.send).toHaveBeenCalledTimes(1);
    });

    it("throws when the original is missing", async () => {
      const client = mockS3Client({ [ORIGINAL_KEY]: "NoSuchKey" });

      await expect(fetchImage(makeMessage("image/jpeg"), client)).rejects.toThrow(
        "Failed to retrieve image",
      );
    });
  });

  describe("PNGs", () => {
    it("uses the optimised PNG when available", async () => {
      const optimisedBytes = new Uint8Array([1, 2, 3]);
      const client = mockS3Client({
        [OPTIMISED_KEY]: optimisedBytes,
        [ORIGINAL_KEY]: fakeImageBytes,
      });

      const result = await fetchImage(makeMessage("image/png"), client);

      expect(result.bytes).toBe(optimisedBytes);
      expect(result.mimeType).toBe("image/png");
    });

    it("falls back to original when optimised is missing", async () => {
      const client = mockS3Client({
        [OPTIMISED_KEY]: "NoSuchKey",
        [ORIGINAL_KEY]: fakeImageBytes,
      });

      const result = await fetchImage(makeMessage("image/png"), client);

      expect(result.bytes).toBe(fakeImageBytes);
      expect(result.mimeType).toBe("image/png");
    });

    it("throws when both optimised and original are missing", async () => {
      const client = mockS3Client({});

      await expect(fetchImage(makeMessage("image/png"), client)).rejects.toThrow(
        "Failed to retrieve image",
      );
    });

    it("uses the key directly when it's already an optimised path", async () => {
      const optimisedKey = `optimised/${ORIGINAL_KEY}`;
      const optimisedBytes = new Uint8Array([1, 2, 3]);
      const client = mockS3Client({
        [optimisedKey]: optimisedBytes,
      });

      const result = await fetchImage(
        makeMessage("image/png", { s3Key: optimisedKey }),
        client,
      );

      expect(result.bytes).toBe(optimisedBytes);
      expect(result.mimeType).toBe("image/png");
      // Should NOT have tried optimised/optimised/...
      expect(client.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("TIFFs", () => {
    it("uses the optimised PNG when available", async () => {
      const optimisedBytes = new Uint8Array([1, 2, 3]);
      const client = mockS3Client({ [OPTIMISED_KEY]: optimisedBytes });

      const result = await fetchImage(makeMessage("image/tiff"), client);

      expect(result.bytes).toBe(optimisedBytes);
      expect(result.mimeType).toBe("image/png");
    });

    it("throws when no optimised PNG exists", async () => {
      const client = mockS3Client({});

      await expect(fetchImage(makeMessage("image/tiff"), client)).rejects.toThrow(
        "Unsupported file type: image/tiff",
      );
    });
  });
});
