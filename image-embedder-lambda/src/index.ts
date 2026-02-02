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
  MAX_PIXELS_BEFORE_COHERE_V4_DOWNSAMPLING,
} from "./constants";

// Initialise clients at module level (cold start only)
const LOCALSTACK_ENDPOINT =
  process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
const isLocal = process.env.IS_LOCAL === "true";

// Determine stage: dev for local, otherwise from environment (test or prod)
const STAGE = isLocal ? "dev" : process.env.STAGE;

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

console.log(`Stage: ${STAGE}`);
console.log(`IS_LOCAL: ${isLocal}`);

const s3Client = new S3Client(s3Config);
const bedrockClient = new BedrockRuntimeClient({ region: "eu-west-1" });
const s3VectorsClient = new S3VectorsClient({ region: "eu-central-1" });

interface SQSMessageBody {
  imageId: string;
  s3Bucket: string;
  s3Key: string;
  fileType: string;
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
  let sharpImage = sharp(imageBytes);
  const { width, height } = await sharpImage.metadata();
  const pixels = width * height;
  const bytesExceedsLimit = imageBytes.length > maxImageSizeBytes;
  const pixelsExceedsLimit = pixels > maxPixels;
  const needsDownscale = bytesExceedsLimit || pixelsExceedsLimit;
  console.log(
    `Image: ${imageBytes.length.toLocaleString()} bytes (${bytesExceedsLimit ? "over" : "within"} limit of ${maxImageSizeBytes.toLocaleString()} bytes), ${pixels.toLocaleString()} px (${pixelsExceedsLimit ? "over" : "within"} limit of ${maxPixels.toLocaleString()} px) → ${needsDownscale ? "downscaling" : "no resize needed"}`
  );
  if (!needsDownscale) {
    return imageBytes;
  }

  const pixelRatio = maxPixels / pixels;

  // Why square root? Because the ratio comes from the multiplied width * height,
  // but we want to use it to scale just the width.
  const scaleFactor = Math.sqrt(pixelRatio);
  const newWidth = Math.floor(width * scaleFactor);
  sharpImage = sharpImage.resize(newWidth);
  // Should auto-scale height because we only passed width
  const { height: newHeight } = await sharpImage.metadata();
  const newPixels = newWidth * newHeight;

  if (mimeType === "image/jpeg") {
    // JPEG compression is lossy, so let"s be conservative here.
    // Also, 95 matches what we do for master crops:
    // https://github.com/guardian/grid/blob/40be8f93f8a6da61c8188332c8e98796dc351ecd/cropper/app/lib/Crops.scala#L24
    sharpImage = sharpImage.jpeg({ quality: 95 });
  } else if (mimeType === "image/png") {
    // PNG compression is lossless, so let"s crank it to the max
    sharpImage = sharpImage.png({ compressionLevel: 9 });
  }

  const result = new Uint8Array(await sharpImage.toBuffer());
  if (result.byteLength > maxImageSizeBytes) {
    throw new Error(
      `Image size was over ${maxImageSizeBytes.toLocaleString()} limit (${result.byteLength.toLocaleString()} bytes) after downscaling from ${width}x${height} (${pixels.toLocaleString()} px) to ${newWidth}x${newHeight} (${newPixels.toLocaleString()} px)`,
    );
  }
  console.log(
    `Image size is ${result.byteLength.toLocaleString()} bytes after downscaling from ${width}x${height} (${pixels.toLocaleString()} px) to ${newWidth}x${newHeight} (${newPixels.toLocaleString()}) px`,
  );

  return result;
}

export async function embedImage(
  imageBytes: Uint8Array,
  imageMimeType: string,
  client: BedrockRuntimeClient,
): Promise<InvokeModelCommandOutput> {
  const processedBytes = await downscaleImageIfNeeded(
    imageBytes,
    imageMimeType,
    MAX_IMAGE_SIZE_BYTES,
    MAX_PIXELS_BEFORE_COHERE_V4_DOWNSAMPLING,
  );
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
    const command = new InvokeModelCommand(input);
    const response = await client.send(command);

    console.log(
      `Got response body of length ${response.body?.length.toLocaleString()} bytes from invoking Bedrock model ${model}, metadata: ${JSON.stringify(response.$metadata)}, `,
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

  for (const record of records) {
    try {
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
        gridImageBytes,
        recordBody.fileType,
        bedrockClient,
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
