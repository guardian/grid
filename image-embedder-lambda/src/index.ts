import {
  Context,
  SQSBatchItemFailure,
  SQSBatchResponse,
  SQSEvent,
  SQSRecord,
} from "aws-lambda";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
  InvokeModelCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
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

const esClient = new Client({
  node: ES_URL,
  // Note: Authentication handled via IAM or network security groups in AWS
  // Local dev will use localstack endpoint via ES_URL
});

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
    console.log(`Bytes array length: ${bytes.length}`);
    return bytes;
  } catch (error) {
    console.error(`Error fetching from S3:`, error);
    throw error;
  }
}

export async function embedImage(
  imageBytes: Uint8Array,
  imageMimeType: string,
  client: BedrockRuntimeClient,
): Promise<InvokeModelCommandOutput> {
  const base64Image = Buffer.from(imageBytes).toString("base64");
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
      `Bedrock response metadata: ${JSON.stringify(response.$metadata)}`,
    );
    console.log(`Response body length: ${response.body?.length}`);

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

      // TODO: downscale image if necessary
      // Currently the image will end up on the DLQ if it's too big
      // because the embedding will fail and it will be added to the BatchItemFailures

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
    await storeEmbeddingsInS3VectorStore(vectors, s3VectorsClient);
    await storeEmbeddingsInElasticsearch(vectors, esClient);
    console.log(`Stored ${vectors.length} vectors`);
  } else {
    console.log(`No vectors to store`);
  }

  return { batchItemFailures };
};
