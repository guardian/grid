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
import {
  SQSMessageBody,
  ValidVector
} from "./models";
import {CachedImageResolver, ImageResolver, S3ImageResolver} from "./imageResolver";
import {S3Fetcher} from "./s3Fetcher";
import {createProductionBedrockClient, embedImage} from "./imageEmbedder";
import {ThrallEventPublisher} from "./thrallEventPublisher";
import {S3VectorStore} from "./s3VectorStore";

// Initialise clients at module level (cold start only)
const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT;
const isLocal = process.env.IS_LOCAL === 'true';

// Determine stage: dev for local, otherwise from environment (test or prod)
const STAGE: string = (isLocal ? 'dev' : process.env.STAGE) ?? 'test';

// Set in TEST/PROD by CDK to the appropriate AWS bucket,
// or locally by `localRun.ts` to the localstack bucket.
// If not set, caching of downscaled images will be disabled.
const DOWNSCALED_IMAGE_BUCKET = process.env.DOWNSCALED_IMAGE_BUCKET;

if (!DOWNSCALED_IMAGE_BUCKET && !isLocal) {
	console.error('DOWNSCALED_IMAGE_BUCKET not set, caching is disabled');
}

const localStackConfig = LOCALSTACK_ENDPOINT
	? {
			endpoint: LOCALSTACK_ENDPOINT,
			forcePathStyle: true,
			credentials: {
				accessKeyId: 'test',
				secretAccessKey: 'test',
			},
		}
	: {};

const kinesisClient = new KinesisClient({
	region: 'eu-west-1',
	...localStackConfig,
});

// Kinesis stream for sending embeddings to Thrall
const THRALL_KINESIS_STREAM_ARN: string = process.env.THRALL_KINESIS_STREAM_ARN ?? '';

const s3Client = new S3Client({
	region: 'eu-west-1',
	...localStackConfig,
});
const s3Fetcher = new S3Fetcher(s3Client);
const imageResolver = new CachedImageResolver(
  new S3ImageResolver(s3Fetcher),
  s3Fetcher,
  s3Client,
  DOWNSCALED_IMAGE_BUCKET,
)
const thrallEventPublisher = new ThrallEventPublisher(kinesisClient, THRALL_KINESIS_STREAM_ARN, STAGE)

const s3VectorsClient = new S3VectorsClient({ region: 'eu-central-1' });
const s3VectorStore = new S3VectorStore(s3VectorsClient, `image-embeddings-${STAGE}`.toLowerCase());

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

			const { bytes: gridImageBytes, mimeType: imageMimeType } =
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
			batchItemFailures.push({ itemIdentifier: record.messageId });
		}
	}

	console.log(
		`Processed ${records.length} records, ${vectors.length} images successfully embedded, ${batchItemFailures.length} failed`,
	);

	return { vectors, batchItemFailures, imageIdToMessageId };
}

export const handler = async (
	event: SQSEvent,
	context: Context,
): Promise<SQSBatchResponse> => {
	console.log(`Starting handler embedding pipeline`);

  const bedrockClient = createProductionBedrockClient();

	const { vectors, batchItemFailures, imageIdToMessageId } =
		await generateVectors(event.Records, imageResolver, bedrockClient);

	if (vectors.length > 0) {
		await thrallEventPublisher.sendEmbeddingsToKinesis(
			vectors,
			imageIdToMessageId,
			batchItemFailures,
		);
		await s3VectorStore.storeEmbeddings(vectors);
	} else {
		console.log(`No vectors to store`);
	}

	return { batchItemFailures };
};
