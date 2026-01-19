import { Context, SQSEvent, SQSRecord } from "aws-lambda";
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

async function getImageFromS3(
  s3Bucket: string,
  s3Key: string,
  client: S3Client
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

async function embedImage(
  inputData: String[],
  client: BedrockRuntimeClient
): Promise<InvokeModelCommandOutput> {
  const model = "cohere.embed-english-v3";
  const body = {
    input_type: "image",
    embedding_types: ["float"],
    images: inputData,
  };
  const jsonBody = JSON.stringify(body);

  const input: InvokeModelCommandInput = {
    modelId: model,
    body: jsonBody,
    accept: "*/*",
    contentType: "application/json",
  };
  console.log(`Invoking Bedrock model: ${model}`);

  try {
    const command = new InvokeModelCommand(input);
    const response = await client.send(command);

    console.log(
      `Bedrock response metadata: ${JSON.stringify(response.$metadata)}`
    );
    console.log(`Response body length: ${response.body?.length}`);

    return response;
  } catch (error) {
    console.error(`Bedrock invocation error:`, error);
    throw error;
  }
}

async function storeEmbedding(
  embedding: number[],
  key: string,
  client: S3VectorsClient
) {
  console.log(
    `Storing embedding of length ${embedding.length} for key: ${key}`
  );

  const inputVector: PutInputVector = {
    key: key,
    data: {
      float32: embedding,
    },
  };

  const input: PutVectorsCommandInput = {
    vectorBucketName: `image-embeddings-${STAGE}`.toLowerCase(),
    indexName: "cohere-embed-english-v3",
    vectors: [inputVector],
  };

  console.log(
    `PutVectorsCommand input: vectorBucketName=${input.vectorBucketName}, indexName=${input.indexName}`
  );

  try {
    const command = new PutVectorsCommand(input);
    const response = await client.send(command);

    console.log(
      `S3 Vectors response metadata: ${JSON.stringify(response.$metadata)}`
    );
    console.log(`Successfully stored embedding for key: ${key}`);

    return response;
  } catch (error) {
    console.error(`Error storing embedding for key: ${key}`, error);
    throw error;
  }
}

export const handler = async (event: SQSEvent, context: Context) => {
  console.log(`Starting handler embedding pipeline`);
  const records: SQSRecord[] = event.Records;
  const recordBody: SQSMessageBody = JSON.parse(records[0].body);

  // If it's a Tiff then we should throw an error
  // So that it ends on the DLQ for processing when we add tiff handling
  if (recordBody.fileType === "image/tiff") {
    console.error(
      `Unsupported file type: ${recordBody.fileType}, ending execution`
    );
    throw new Error(`Unsupported file type: ${recordBody.fileType}`);
  }

  const gridImage = await getImageFromS3(
    recordBody.s3Bucket,
    recordBody.s3Key,
    s3Client
  );
  const base64Image = Buffer.from(gridImage).toString("base64");
  const inputImage = `data:${recordBody.fileType};base64,${base64Image}`;

  // TODO: downscale image if necessary
  // Currently the image will end up on the DLQ if it's too big
  // because the embedding will fail

  const embeddingResponse = await embedImage([inputImage], bedrockClient);
  const responseBody = JSON.parse(
    new TextDecoder().decode(embeddingResponse.body)
  );
  // Extract the embedding array (first element since we only sent one image)
  const embedding: number[] = responseBody.embeddings.float[0];

  console.log(`First 5 values: ${embedding.slice(0, 5)}`);

  await storeEmbedding(embedding, recordBody.imageId, s3VectorsClient);

  console.log(`Finished image image pipeline successfully!`);
};
