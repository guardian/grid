import { mockClient } from "aws-sdk-client-mock";
import { S3VectorsClient, PutVectorsCommand } from "@aws-sdk/client-s3vectors";
import { Context, SQSEvent, SQSRecord } from "aws-lambda";
import { handler, SQSMessageBody } from "../../src/index";

/**
 * Integration tests for the full embedding pipeline via the handler.
 * Currently only intended to be manually trigged locally.
 *
 * Infrastructure used:
 *   SQS                          — not used (events are constructed in-memory)
 *   S3 source images             — AWS  (bucket: image-embedding-test)
 *   S3 downscaled image cache    — AWS  (bucket: $DOWNSCALED_IMAGE_BUCKET, if set; otherwise caching is skipped)
 *   Bedrock (Cohere embedding)   — AWS
 *   S3 Vectors                   — test mock (aws-sdk-client-mock; no vector store needed)
 * 
 * Currently this does *not* test caching behaviour as DOWNSCALED_IMAGE_BUCKET
 * is not set as an env var for the handler.
 *
 * Requires:
 *   - Valid AWS credentials with S3 and Bedrock permissions
 *   - Test images uploaded to image-embedding-test
 *   - For TIFF images: optimised PNGs at optimised/<key> in the same bucket
 *
 * Run with: npm run test:integration
 */

const TEST_BUCKET = "image-embedding-test";

const s3VectorsMock = mockClient(S3VectorsClient);

interface TestImage {
  name: string;
  imageId: string;
  s3Key: string;
  fileType: "image/jpeg" | "image/png" | "image/tiff";
}

const TEST_IMAGES: TestImage[] = [
  {
    name: "JPEG over 5 MB but just under 5 MiB",
    imageId: "aaf514e9530271ab5639bb5f496eef97cdce9b7a",
    s3Key: "large-images/aaf514e9530271ab5639bb5f496eef97cdce9b7a.jpeg",
    fileType: "image/jpeg",
  },
  {
    name: "JPEG just over 5 MiB",
    imageId: "5f8871b3686d06dadf3e7556cca2601c3b276288",
    s3Key: "large-images/5f8871b3686d06dadf3e7556cca2601c3b276288.jpeg",
    fileType: "image/jpeg",
  },
  {
    name: "JPEG over 10 MB",
    imageId: "fed92369dbbc961708ab883da815fc4c7f52597e",
    s3Key: "large-images/fed92369dbbc961708ab883da815fc4c7f52597e.jpeg",
    fileType: "image/jpeg",
  },
  {
    name: "Small PNG",
    imageId: "339d129c0b0f47507f7d299bf28046d40c12d368",
    s3Key: "pngs/339d129c0b0f47507f7d299bf28046d40c12d368.png",
    fileType: "image/png",
  },
  {
    name: "Large PNG",
    imageId: "c2039d7b0ba13910d7f8147128b86199784465ae",
    s3Key: "pngs/c2039d7b0ba13910d7f8147128b86199784465ae.png",
    fileType: "image/png",
  },
  {
    name: "Small TIFF",
    imageId: "b927f8924960874eda447208baa3fe7963cba8c4",
    s3Key: "tiffs/b927f8924960874eda447208baa3fe7963cba8c4",
    fileType: "image/tiff",
  },
  {
    name: "Large TIFF",
    imageId: "7d0b7c7b8e890d7e5d369093aa437bd833e20f71",
    s3Key: "tiffs/7d0b7c7b8e890d7e5d369093aa437bd833e20f71",
    fileType: "image/tiff",
  },
];

function makeSQSEvent(image: TestImage): SQSEvent {
  const body: SQSMessageBody = {
    imageId: image.imageId,
    s3Bucket: TEST_BUCKET,
    s3Key: image.s3Key,
    fileType: image.fileType,
  };
  const record: SQSRecord = {
    messageId: image.imageId,
    receiptHandle: "",
    body: JSON.stringify(body),
    attributes: { ApproximateReceiveCount: "1", SentTimestamp: "0", SenderId: "", ApproximateFirstReceiveTimestamp: "0" },
    messageAttributes: {},
    md5OfBody: "",
    eventSource: "aws:sqs",
    eventSourceARN: "",
    awsRegion: "eu-west-1",
  };
  return { Records: [record] };
}

describe("Handler embedding pipeline (end-to-end)", () => {
  beforeEach(() => {
    s3VectorsMock.reset();
    s3VectorsMock.on(PutVectorsCommand).resolves({ $metadata: { httpStatusCode: 200 } });
  });

  it.each(TEST_IMAGES)("should successfully embed and store $name", async (image) => {
    const result = await handler(makeSQSEvent(image), {} as Context);

    expect(result.batchItemFailures).toEqual([]);

    const putCalls = s3VectorsMock.commandCalls(PutVectorsCommand);
    const storedKeys = putCalls.flatMap(c => (c.args[0].input.vectors ?? []).map(v => v.key));
    expect(storedKeys).toContain(image.imageId);
  });
});
