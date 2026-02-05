import {
  Context,
  SQSBatchItemFailure,
  SQSBatchResponse,
  SQSEvent,
  SQSRecord,
} from "aws-lambda";
import {
  BedrockRuntimeClient,
  ImageBlock$,
  InvokeModelCommand,
  InvokeModelCommandInput,
  InvokeModelCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import sharp from "sharp";
import {
  GetObjectCommand,
  GetObjectCommandOutput,
  GetObjectRequest,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  PutInputVector,
  PutVectorsCommand,
  PutVectorsCommandInput,
  S3VectorsClient,
} from "@aws-sdk/client-s3vectors";
import {
  MAX_IMAGE_SIZE_BYTES,
  MAX_PIXELS_COHERE_V4,
} from "./constants";
import { Client } from "@elastic/elasticsearch";

// Initialise clients at module level (cold start only)
const LOCALSTACK_ENDPOINT =
  process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
const isLocal = process.env.IS_LOCAL === "true";

// Determine stage: dev for local, otherwise from environment (test or prod)
const STAGE = isLocal ? "dev" : process.env.STAGE;
const ES_URL = process.env.ES_URL || "http://localhost:9200";

if (!ES_URL) {
  throw new Error("ES_URL environment variable is required");
}

// Set in TEST/PROD by CDK to the appropriate AWS bucket,
// or locally by `localRun.ts` to the localstack bucket.
// If not set, caching of downscaled images will be disabled.
const DOWNSCALED_IMAGE_BUCKET = process.env.DOWNSCALED_IMAGE_BUCKET;

if (!DOWNSCALED_IMAGE_BUCKET && !isLocal) {
  console.error("DOWNSCALED_IMAGE_BUCKET not set, caching is disabled");
}

const s3Config = {
  region: "eu-west-1",
  ...(isLocal && {
    endpoint: LOCALSTACK_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: "test",
      secretAccessKey: "test",
    },
  }),
};

const s3Client = new S3Client(s3Config);
const bedrockClient = new BedrockRuntimeClient({ region: "eu-west-1" });
const s3VectorsClient = new S3VectorsClient({ region: "eu-central-1" });

const esClient = new Client({
  node: ES_URL,
  // Note: Authentication handled via IAM or network security groups in AWS
  // Local dev will use localstack endpoint via ES_URL
});

console.log(`Elasticsearch URL: ${ES_URL}`);

interface SQSMessageBody {
  imageId: string;
  s3Bucket: string;
  s3Key: string;
  fileType: string;
}

export interface CohereV3Embedding {
  image: number[];
}

export interface Embedding {
  cohereEmbedEnglishV3: CohereV3Embedding;
}

export interface Embeddings {
  imageId: string;
  embedding: Embedding;
}

export async function getImageFromS3(
  s3Bucket: string,
  s3Key: string,
  client: S3Client,
): Promise<Uint8Array | undefined> {
  const input: GetObjectRequest = {
    Bucket: s3Bucket,
    Key: s3Key,
  };

  console.log(`Fetching image from S3: bucket=${s3Bucket}, key=${s3Key}`);
  try {
    const command = new GetObjectCommand(input);
    const response: GetObjectCommandOutput = await client.send(command);

    console.log(`S3 response metadata: ${JSON.stringify(response.$metadata)}`);

    if (!response.Body) {
      console.log(`Returning undefined: response.Body is falsy`);
      return undefined;
    }

    if (response.ContentLength === 0) {
      console.log(`Warning: ContentLength is 0, file may be empty`);
    }

    const bytes = await response.Body.transformToByteArray();
    console.log(`Successfully fetched image of size ${bytes.length.toLocaleString()} bytes from S3`);
    return bytes;
  } catch (error) {
    console.error(`Error fetching from S3:`, error);
    throw error;
  }
}

export async function downscaleImageIfNeeded(
  imageBytes: Uint8Array,
  mimeType: string,
  maxImageSizeBytes: number,
  maxPixels: number,
): Promise<Uint8Array> {
  const start = performance.now();
  let sharpImage = sharp(imageBytes);
  const { width, height } = await sharpImage.metadata();
  const pixels = width * height;
  const bytesExceedsLimit = imageBytes.length > maxImageSizeBytes;
  const pixelsExceedsLimit = pixels > maxPixels;
  const needsDownscale = bytesExceedsLimit || pixelsExceedsLimit;
  console.log(
    `Image has ${imageBytes.length.toLocaleString()} bytes (${bytesExceedsLimit ? "over" : "within"} limit of ${maxImageSizeBytes.toLocaleString()} bytes), ${pixels.toLocaleString()} px (${pixelsExceedsLimit ? "over" : "within"} limit of ${maxPixels.toLocaleString()} px) → ${needsDownscale ? "downscaling" : "no resize needed"}`,
  );
  if (!needsDownscale) {
    console.log(`Downscale check took ${(performance.now() - start).toFixed(0)}ms (no resize)`);
    return imageBytes;
  }

  const pixelRatio = maxPixels / pixels;

  // Why square root? Because the ratio comes from the multiplied width * height,
  // but we want to use it to scale just the width.
  const scaleFactor = Math.sqrt(pixelRatio);
  // Floor because we want to make sure we're under the limit afterwards
  const newWidth = Math.floor(width * scaleFactor);

  sharpImage = sharpImage.resize(newWidth);

  if (mimeType === "image/jpeg") {
    // JPEG compression is lossy, so let's be conservative here.
    // Also, 95 matches what we do for master crops:
    // https://github.com/guardian/grid/blob/40be8f93f8a6da61c8188332c8e98796dc351ecd/cropper/app/lib/Crops.scala#L24
    sharpImage = sharpImage.jpeg({ quality: 95 });
  } else if (mimeType === "image/png") {
    // PNG compression is lossless, so let's crank it to the max
    sharpImage = sharpImage.png({ compressionLevel: 9 });
  }

  const buffer = await sharpImage.toBuffer();
  const result = new Uint8Array(buffer);

  // Q. Why not calculate height ourselves?
  // A. We want the same rounding that sharp uses when it auto-resizes
  // Q. Why not read the new height from the existing `sharpImage` object?
  // A. Surprisingly, metadata doesn't get updated on calling resize. We need to output to buffer first.
  const { height: newHeight } = await sharp(buffer).metadata();
  const newPixels = newWidth * newHeight;
  if (result.byteLength > maxImageSizeBytes) {
    throw new Error(
      `Image has ${result.byteLength.toLocaleString()} bytes (over limit of ${maxImageSizeBytes.toLocaleString()} bytes) after downscaling from ${width}x${height} (${pixels.toLocaleString()} px) to ${newWidth}x${newHeight} (${newPixels.toLocaleString()} px)`,
    );
  }
  console.log(
    `Image has ${result.byteLength.toLocaleString()} bytes after downscaling from ${width}x${height} (${pixels.toLocaleString()} px) to ${newWidth}x${newHeight} (${newPixels.toLocaleString()} px), took ${(performance.now() - start).toFixed(0)}ms`,
  );

  return result;
}

// Matches the partitioned key structure used by Grid's image bucket for S3 performance at scale
// e.g. imageId "51bfb4107d1640aa74c45aaa51985e4e03852440" → "5/1/b/f/b/4/51bfb4107d1640aa74c45aaa51985e4e03852440"
function toPartitionedKey(imageId: string): string {
  const prefix = imageId.slice(0, 6).split("").join("/");
  return `${prefix}/${imageId}`;
}

async function getCachedDownscaledImage(
  imageId: string,
  client: S3Client,
): Promise<Uint8Array | undefined> {
  if (!DOWNSCALED_IMAGE_BUCKET) {
    console.log(`No downscaled image bucket configured, skipping cache lookup`);
    return undefined;
  }

  const key = toPartitionedKey(imageId);
  try {
    const command = new GetObjectCommand({
      Bucket: DOWNSCALED_IMAGE_BUCKET,
      Key: key,
    });
    const response = await client.send(command);

    if (!response.Body) {
      return undefined;
    }

    const bytes = await response.Body.transformToByteArray();
    console.log(`Cache hit: found downscaled image for ${imageId} (${bytes.length.toLocaleString()} bytes)`);
    return bytes;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "NoSuchKey") {
      console.log(`Cache miss: no downscaled image for ${imageId}`);
      return undefined;
    }
    // Log but don't throw - cache failures shouldn't break the pipeline
    console.warn(`Error checking cache for ${imageId}:`, error);
    return undefined;
  }
}

async function cacheDownscaledImage(
  imageId: string,
  imageBytes: Uint8Array,
  mimeType: string,
  client: S3Client,
): Promise<void> {
  if (!DOWNSCALED_IMAGE_BUCKET) {
    console.log("No DOWNSCALED_IMAGE_BUCKET set, will not cache downscaled image");
    return;
  }

  const key = toPartitionedKey(imageId);
  try {
    const command = new PutObjectCommand({
      Bucket: DOWNSCALED_IMAGE_BUCKET,
      Key: key,
      Body: imageBytes,
      ContentType: mimeType,
    });
    await client.send(command);
    console.log(`Cached downscaled image for ${imageId} (${imageBytes.length.toLocaleString()} bytes)`);
  } catch (error) {
    // Log but don't throw - cache failures shouldn't break the pipeline
    console.warn(`Failed to cache downscaled image for ${imageId}:`, error);
  }
}

export async function embedImage(
  imageId: string,
  imageBytes: Uint8Array,
  imageMimeType: string,
  bedrockClient: BedrockRuntimeClient,
  s3Client: S3Client,
): Promise<InvokeModelCommandOutput> {
  // Try to get cached downscaled image first
  let processedBytes = await getCachedDownscaledImage(imageId, s3Client);

  if (!processedBytes) {
    processedBytes = await downscaleImageIfNeeded(
      imageBytes,
      imageMimeType,
      MAX_IMAGE_SIZE_BYTES,
      MAX_PIXELS_COHERE_V4,
    );

    // Cache if we actually downscaled (bytes changed)
    if (processedBytes !== imageBytes) {
      await cacheDownscaledImage(imageId, processedBytes, imageMimeType, s3Client);
    }
  }

  const base64Image = Buffer.from(processedBytes).toString("base64");
  const model = "cohere.embed-english-v3";
  const body = {
    input_type: "image",
    embedding_types: ["float"],
    images: [`data:${imageMimeType};base64,${base64Image}`],
  };

  const input: InvokeModelCommandInput = {
    modelId: model,
    body: JSON.stringify(body),
    accept: "*/*",
    contentType: "application/json",
  };
  console.log(`Invoking Bedrock model: ${model}`);

  try {
    const embedStart = performance.now();
    const command = new InvokeModelCommand(input);
    const response = await bedrockClient.send(command);
    const embedMs = performance.now() - embedStart;

    console.log(
      `Embedding took ${embedMs.toFixed(0)}ms, response ${response.body?.length.toLocaleString()} bytes, metadata: ${JSON.stringify(response.$metadata)}`,
    );

    return response;
  } catch (error) {
    console.error(`Bedrock invocation error:`, error);
    throw error;
  }
}

async function storeEmbeddingsInS3VectorStore(
  vectors: PutInputVector[],
  client: S3VectorsClient,
) {
  console.log(`Storing ${vectors.length} embeddings to vector store`);

  const input: PutVectorsCommandInput = {
    vectorBucketName: `image-embeddings-${STAGE}`.toLowerCase(),
    indexName: "cohere-embed-english-v3",
    vectors: vectors,
  };

  console.log(
    `PutVectorsCommand input: vectorBucketName=${input.vectorBucketName}, indexName=${input.indexName}, vectorCount=${vectors.length}`,
  );

  try {
    const command = new PutVectorsCommand(input);
    const response = await client.send(command);

    console.log(
      `S3 Vectors response metadata: ${JSON.stringify(response.$metadata)}`,
    );
    console.log(`Successfully stored ${vectors.length} embeddings`);

    return response;
  } catch (error) {
    console.error(`Error storing embeddings:`, error);
    throw error;
  }
}

function convertToEsStructure(vectors: PutInputVector[]): Embeddings[] {
  const embeddings = vectors.map((vector) => {
    // Check for any vectors with undefined data - this should cause the batch to fail and retry/DLQ
    if (
      vector.data === undefined ||
      vector.data.float32 === undefined ||
      vector.key === undefined
    ) {
      throw new Error(
        `Vector found with undefined data. This batch will be retried or sent to DLQ.`,
      );
    }

    const embedding: Embedding = {
      cohereEmbedEnglishV3: {
        image: vector.data.float32!,
      },
    };

    return {
      imageId: vector.key,
      embedding: embedding,
    };
  });
  return embeddings;
}

async function storeEmbeddingsInElasticsearch(
  vectors: PutInputVector[],
  client: Client,
) {
  console.log(`Storing ${vectors.length} embeddings to Elasticsearch`);

  const embeddings: Embeddings[] = convertToEsStructure(vectors);
  console.log(`Converted ${embeddings.length} vectors to Embedding format`);

  const operations = embeddings.flatMap((doc) => [
    { update: { _index: "images", _id: doc.imageId } },
    { doc: { embedding: doc.embedding } },
  ]);

  const bulkResponse = await client.bulk({ operations });

  if (bulkResponse.errors) {
    console.error("Bulk indexing had errors:");
    bulkResponse.items?.forEach((item) => {
      if (item.update?.error) {
        console.error(
          `Error for ${item.update._id}:`,
          JSON.stringify(item.update.error, null, 2),
        );
      }
    });
  } else {
    console.log(`Successfully indexed ${embeddings.length} documents`);
  }
}

export const handler = async (
  event: SQSEvent,
  context: Context,
): Promise<SQSBatchResponse> => {
  console.log(`Starting handler embedding pipeline`);
  const records: SQSRecord[] = event.Records;
  console.log(`Processing ${records.length} SQS records`);

  const vectors: PutInputVector[] = [];
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const [i, record] of records.entries()) {
    try {
      console.log(`Parsing record ${i+1} of ${records.length}: ${record.body}`);
      const recordBody: SQSMessageBody = JSON.parse(record.body);

      // If it's a Tiff then we should log an error
      // And add it to the BatchItemFailures
      // So that it ends on the DLQ for processing when we add tiff handling
      if (recordBody.fileType === "image/tiff") {
        throw new Error(
          `Unsupported file type: ${recordBody.fileType} for image ${recordBody.imageId}`,
        );
      }

      const gridImageBytes = await getImageFromS3(
        recordBody.s3Bucket,
        recordBody.s3Key,
        s3Client,
      );

      if (!gridImageBytes) {
        throw new Error(
          `Failed to retrieve image from S3 for image ${recordBody.imageId}`,
        );
      }

      const embeddingResponse = await embedImage(
        recordBody.imageId,
        gridImageBytes,
        recordBody.fileType,
        bedrockClient,
        s3Client,
      );
      const responseBody = JSON.parse(
        new TextDecoder().decode(embeddingResponse.body),
      );
      // Extract the embedding array (first element since we only sent one image)
      const embedding: number[] = responseBody.embeddings.float[0];

      console.log(
        `Generated embedding for ${recordBody.imageId}, first 5 values: ${embedding.slice(0, 5)}`,
      );

      vectors.push({
        key: recordBody.imageId,
        data: {
          float32: embedding,
        },
      });
    } catch (error) {
      console.error(`Error processing record ${record.messageId}:`, error);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  console.log(
    `Processed ${records.length} records, ${vectors.length} images successfully embedded, ${batchItemFailures.length} failed`,
  );

  if (vectors.length > 0) {
    await storeEmbeddingsInS3VectorStore(vectors, s3VectorsClient);
    await storeEmbeddingsInElasticsearch(vectors, esClient);
    console.log(`Stored ${vectors.length} vectors`);
  } else {
    console.log(`No vectors to store`);
  }

  return { batchItemFailures };
};
