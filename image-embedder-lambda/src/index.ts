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

// Initialise clients at module level (cold start only)
const LOCALSTACK_ENDPOINT =
  process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
const isLocal = process.env.IS_LOCAL === "true";

// Determine stage: dev for local, otherwise from environment (test or prod)
const STAGE = isLocal ? "dev" : process.env.STAGE;

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

export interface SQSMessageBody {
  imageId: string;
  s3Bucket: string;
  s3Key: string;
  fileType: string;
}

export interface FetchedImage {
  bytes: Uint8Array;
  mimeType: string;
}

// For TIFFs and PNGs, try the optimised PNG first — it's smaller and always a supported format.
// Essential for TIFFs (Cohere rejects them), nice-to-have for PNGs (less downscaling).
export async function fetchImage(message: SQSMessageBody, client: S3Client): Promise<FetchedImage> {
  const hasOptimised = message.fileType === "image/tiff" || message.fileType === "image/png";

  if (hasOptimised) {
    const optimisedKey = `optimised/${message.s3Key}`;
    const bytes = await getImageFromS3(message.s3Bucket, optimisedKey, client);
    if (bytes) {
      console.log(`Using optimised PNG for ${message.imageId}`);
      return { bytes, mimeType: "image/png" };
    }
    console.log(`No optimised PNG for ${message.imageId}, falling back to original`);
  }

  if (message.fileType === "image/tiff") {
    throw new Error(`Unsupported file type: image/tiff for image ${message.imageId} (no optimised PNG found)`);
  }

  const bytes = await getImageFromS3(message.s3Bucket, message.s3Key, client);
  if (!bytes) {
    throw new Error(`Failed to retrieve image from S3 for image ${message.imageId}`);
  }

  return { bytes, mimeType: message.fileType };
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

  const logSuffix = `(bucket = ${s3Bucket}, key = ${s3Key})`;
  console.log(`Fetching image from S3 ${logSuffix}`);
  try {
    const command = new GetObjectCommand(input);
    const response: GetObjectCommandOutput = await client.send(command);

    if (!response.Body) {
      console.warn(`No body in S3 response ${logSuffix}`);
      return undefined;
    }

    const bytes = await response.Body.transformToByteArray();
    console.log(
      `Fetched image: ${bytes.length.toLocaleString()} bytes ${logSuffix}`,
    );
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") {
      console.log(`No object found in S3 ${logSuffix}`);
    } else {
      console.error(`Failed to fetch from S3 ${logSuffix}: `, error);
    }
    return undefined;
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
  const bytes = await getImageFromS3(DOWNSCALED_IMAGE_BUCKET, key, client);
  if (bytes) {
    console.log(`Cache hit: found downscaled image for ${imageId} (${bytes.length.toLocaleString()} bytes)`);
  } else {
    console.log(`Cache miss: no downscaled image for ${imageId}`);
  }
  return bytes;
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

async function storeEmbeddings(
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

      const { bytes: gridImageBytes, mimeType: imageMimeType } = await fetchImage(recordBody, s3Client);

      const embeddingResponse = await embedImage(
        recordBody.imageId,
        gridImageBytes,
        imageMimeType,
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
    await storeEmbeddings(vectors, s3VectorsClient);
  } else {
    console.log(`No vectors to store`);
  }

  return { batchItemFailures };
};
