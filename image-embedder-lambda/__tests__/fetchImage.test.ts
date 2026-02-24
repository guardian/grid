import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { sdkStreamMixin } from "@smithy/util-stream";
import { Readable } from "stream";
import { fetchImage, FetchedImage } from "../src/index";

const s3Mock = mockClient(S3Client);
const client = new S3Client({});

let s3Objects: Record<string, Uint8Array> = {};

// Declare the contents of the mock S3 bucket.
// Keys not listed will 404.
function givenS3Has(keys: string[]) {
  s3Objects = Object.fromEntries(
    keys.map((key, i) => [key, new Uint8Array([i])]),
  );
  s3Mock.reset();
  s3Mock.on(GetObjectCommand).callsFake(async (input) => {
    const bytes = s3Objects[input.Key!];
    if (!bytes) {
      const error = new Error("NoSuchKey");
      error.name = "NoSuchKey";
      throw error;
    }
    return { Body: sdkStreamMixin(Readable.from([bytes])) };
  });
}

// The expected FetchedImage for a key that exists in the mock bucket.
function fetched(key: string, mimeType: string): FetchedImage {
  return { bytes: s3Objects[key], mimeType };
}

function requestedKeys(): string[] {
  return s3Mock.commandCalls(GetObjectCommand).map(c => c.args[0].input.Key!);
}

describe("fetchImage", () => {
  describe("JPEGs", () => {
    it("fetches the original directly", async () => {
      givenS3Has(["a/b/c/abc123"]);

      const result = await fetchImage(
        {
          imageId: "abc123",
          s3Bucket: "test-bucket",
          s3Key: "a/b/c/abc123",
          fileType: "image/jpeg",
        },
        client,
      );

      expect(result).toEqual(fetched("a/b/c/abc123", "image/jpeg"));
      expect(requestedKeys()).toEqual(["a/b/c/abc123"]);
    });

    it("throws when the original is missing", async () => {
      givenS3Has([]);

      await expect(
        fetchImage(
          {
            imageId: "abc123",
            s3Bucket: "test-bucket",
            s3Key: "a/b/c/abc123",
            fileType: "image/jpeg",
          },
          client,
        ),
      ).rejects.toThrow("Failed to retrieve image");
    });

    it("does not try optimised even if present when original is not", async () => {
      givenS3Has(["optimised/a/b/c/abc123"]);

      await expect(
        fetchImage(
          {
            imageId: "abc123",
            s3Bucket: "test-bucket",
            s3Key: "a/b/c/abc123",
            fileType: "image/jpeg",
          },
          client,
        ),
      ).rejects.toThrow("Failed to retrieve image");
    });

  });

  describe("PNGs", () => {
    it("uses the optimised PNG in preference to the original, when both exist", async () => {
      givenS3Has(["optimised/a/b/c/abc123", "a/b/c/abc123"]);

      const result = await fetchImage({
        imageId: "abc123",
        s3Bucket: "test-bucket",
        s3Key: "a/b/c/abc123",
        fileType: "image/png",
      }, client);

      expect(result).toEqual(fetched("optimised/a/b/c/abc123", "image/png"));
      expect(requestedKeys()).toEqual(["optimised/a/b/c/abc123"]);
    });

    it("uses the optimised PNG when original does not exist", async () => {
      givenS3Has(["optimised/a/b/c/abc123"]);

      const result = await fetchImage(
        {
          imageId: "abc123",
          s3Bucket: "test-bucket",
          s3Key: "a/b/c/abc123",
          fileType: "image/png",
        },
        client,
      );

      expect(result).toEqual(
        fetched("optimised/a/b/c/abc123", "image/png"),
      );
      expect(requestedKeys()).toEqual(["optimised/a/b/c/abc123"]);
    });

    it("falls back to original when optimised is missing", async () => {
      givenS3Has(["a/b/c/abc123"]);

      const result = await fetchImage({
        imageId: "abc123",
        s3Bucket: "test-bucket",
        s3Key: "a/b/c/abc123",
        fileType: "image/png",
      }, client);

      expect(result).toEqual(fetched("a/b/c/abc123", "image/png"));
      // It tried the optimised, couldn't find it, so then tried the original
      expect(requestedKeys()).toEqual(["optimised/a/b/c/abc123", "a/b/c/abc123"]);
    });

    it("throws when both optimised and original are missing", async () => {
      givenS3Has([]);

      await expect(fetchImage({
        imageId: "abc123",
        s3Bucket: "test-bucket",
        s3Key: "a/b/c/abc123",
        fileType: "image/png",
      }, client)).rejects.toThrow("Failed to retrieve image");
    });

    it("uses the key directly when it's already an optimised path", async () => {
      givenS3Has(["optimised/a/b/c/abc123"]);

      const result = await fetchImage({
        imageId: "abc123",
        s3Bucket: "test-bucket",
        s3Key: "optimised/a/b/c/abc123",
        fileType: "image/png",
      }, client);

      expect(result).toEqual(fetched("optimised/a/b/c/abc123", "image/png"));
      expect(requestedKeys()).toEqual(["optimised/a/b/c/abc123"]);
    });
  });

  describe("TIFFs", () => {
    it("uses the optimised PNG in place of the original, when both exist", async () => {
      givenS3Has(["a/b/c/abc123", "optimised/a/b/c/abc123"]);

      const result = await fetchImage(
        {
          imageId: "abc123",
          s3Bucket: "test-bucket",
          s3Key: "a/b/c/abc123",
          fileType: "image/tiff",
        },
        client,
      );

      expect(result).toEqual(fetched("optimised/a/b/c/abc123", "image/png"));
      expect(requestedKeys()).toEqual(["optimised/a/b/c/abc123"]);
    });

    it("uses the optimised PNG when original does not exist", async () => {
      givenS3Has(["optimised/a/b/c/abc123"]);

      const result = await fetchImage(
        {
          imageId: "abc123",
          s3Bucket: "test-bucket",
          s3Key: "a/b/c/abc123",
          fileType: "image/tiff",
        },
        client,
      );

      expect(result).toEqual(fetched("optimised/a/b/c/abc123", "image/png"));
      expect(requestedKeys()).toEqual(["optimised/a/b/c/abc123"]);
    });


    it("throws when neither original TIFF nor optimised PNG exists", async () => {
      givenS3Has([]);

      await expect(fetchImage({
        imageId: "abc123",
        s3Bucket: "test-bucket",
        s3Key: "a/b/c/abc123",
        fileType: "image/tiff",
      }, client)).rejects.toThrow("Unsupported file type: image/tiff");
    });

    it("throws when no optimised PNG exists, even if the original TIFF exists", async () => {
      givenS3Has(["a/b/c/abc123"]);

      await expect(
        fetchImage(
          {
            imageId: "abc123",
            s3Bucket: "test-bucket",
            s3Key: "a/b/c/abc123",
            fileType: "image/tiff",
          },
          client,
        ),
      ).rejects.toThrow("Unsupported file type: image/tiff");
    });
  });
});
