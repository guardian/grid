import 'source-map-support/register';
import {
  Context,
  SQSBatchItemFailure,
  SQSBatchResponse,
  SQSEvent,
  SQSRecord,
} from 'aws-lambda';
import {
  BedrockRuntimeClient,
} from '@aws-sdk/client-bedrock-runtime';
import {
  S3Client,
} from '@aws-sdk/client-s3';
import {S3VectorsClient} from '@aws-sdk/client-s3vectors';
import {KinesisClient} from '@aws-sdk/client-kinesis';
import {ValidVector} from "./models";
import {CachedImageResolver, ImageResolver, S3ImageResolver} from "./imageResolver";
import {S3Fetcher} from "./s3Fetcher";
import {createProductionBedrockClient, embedImage} from "./imageEmbedder";
import {ThrallEventPublisher} from "./thrallEventPublisher";
import {S3VectorStore} from "./s3VectorStore";
import {SQSMessageBody} from "../shared/sqsMessageBody";

export interface Environment {
  isLocal: boolean;
  stage: string;
  downscaledImageBucket?: string;
  thrallKinesisStreamArn: string;
}

export interface AWSClients {
  kinesis: KinesisClient;
  s3: S3Client;
  s3VectorsClient: S3VectorsClient;
}

// Once the clients are warmed up, keep them in cache at the module level
// This makes subsequent lambda invocations faster
let awsClientsCache: AWSClients | null = null;

function initializeAwsClients(): AWSClients {
  if (awsClientsCache) {
    return awsClientsCache;
  }
  awsClientsCache = {
    kinesis: new KinesisClient({region: 'eu-west-1'}),
    s3: new S3Client({region: 'eu-west-1'}),
    s3VectorsClient: new S3VectorsClient({region: 'eu-west-1'}),
  }
  return awsClientsCache;
}

export interface GenerateVectorsResult {
  vectors: ValidVector[];
  batchItemFailures: SQSBatchItemFailure[];
  imageIdToMessageId: Map<string, string>;
}

export async function generateVectors(
  records: SQSRecord[],
  imageResolver: ImageResolver,
  bedrockClient: BedrockRuntimeClient,
): Promise<GenerateVectorsResult> {
  console.log(`Processing ${records.length} SQS records`);

  const vectors: ValidVector[] = [];
  const batchItemFailures: SQSBatchItemFailure[] = [];
  const imageIdToMessageId = new Map<string, string>();

  for (const [i, record] of records.entries()) {
    try {
      console.log(
        `Parsing record ${i + 1} of ${records.length}: ${record.body}`,
      );
      const recordBody: SQSMessageBody = JSON.parse(record.body);

      const {bytes: gridImageBytes, mimeType: imageMimeType} =
        await imageResolver.fetchImage(recordBody);

      const embeddingResponse = await embedImage(
        gridImageBytes,
        imageMimeType,
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
      imageIdToMessageId.set(recordBody.imageId, record.messageId);
    } catch (error) {
      console.error(`Error processing record ${record.messageId}:`, error);
      batchItemFailures.push({itemIdentifier: record.messageId});
    }
  }

  console.log(
    `Processed ${records.length} records, ${vectors.length} images successfully embedded, ${batchItemFailures.length} failed`,
  );

  return {vectors, batchItemFailures, imageIdToMessageId};
}

export const computeEmbeddingForSQSEvent = async (
  clients: AWSClients,
  event: SQSEvent,
  environment: Environment,
): Promise<SQSBatchResponse> => {
  const thrallEventPublisher = new ThrallEventPublisher(
    clients.kinesis,
    environment.thrallKinesisStreamArn,
    environment.stage
  )
  const s3Fetcher = new S3Fetcher(clients.s3);
  const imageResolver = new CachedImageResolver(
    new S3ImageResolver(s3Fetcher),
    s3Fetcher,
    clients.s3,
    environment.downscaledImageBucket,
  )


  const s3VectorStore = new S3VectorStore(clients.s3VectorsClient, `image-embeddings-${environment.stage}`.toLowerCase());


  const bedrockClient = createProductionBedrockClient();

  const { vectors, batchItemFailures, imageIdToMessageId } =
    await generateVectors(event.Records, imageResolver, bedrockClient);

	if (vectors.length > 0) {
		const shortenedVectors = thrallEventPublisher.matryoshkaEmbeddingToElasticsearchDimensions(vectors);
		await thrallEventPublisher.sendEmbeddingsToKinesis(
			shortenedVectors,
			imageIdToMessageId,
			batchItemFailures,
		);
		await s3VectorStore.storeEmbeddings(vectors);
	} else {
		console.log(`No vectors to store`);
	}

  return {batchItemFailures};
};

export const handler = async (
  event: SQSEvent,
  context: Context,
): Promise<SQSBatchResponse> => {
  console.log(`Starting handler embedding pipeline`);

  if (!process.env.DOWNSCALED_IMAGE_BUCKET) {
    console.error('DOWNSCALED_IMAGE_BUCKET environment variable is not set. Caching of downscaled images will be disabled.');
  }

  if (!process.env.THRALL_KINESIS_STREAM_ARN) {
    console.error('THRALL_KINESIS_STREAM_ARN environment variable is not set.');
    throw new Error('THRALL_KINESIS_STREAM_ARN is not set');
  }

  if (!process.env.STAGE) {
    console.error('STAGE environment variable is not set.');
    throw new Error('STAGE environment variable is not set.');
  }

  const environment: Environment = {
    isLocal: false,
    stage: process.env.STAGE,
    downscaledImageBucket: process.env.DOWNSCALED_IMAGE_BUCKET,
    thrallKinesisStreamArn: process.env.THRALL_KINESIS_STREAM_ARN
  }

  // Initialise clients at module level (cold start only)
  const clients = initializeAwsClients()
  return computeEmbeddingForSQSEvent(clients, event, environment);
};
