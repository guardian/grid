import {
	Context,
	SQSBatchItemFailure,
	SQSBatchResponse,
	SQSEvent,
	SQSRecord,
} from 'aws-lambda';
import { LogLevel } from '@aws-sdk/config/logger';
import {
	BedrockRuntimeClient,
	InvokeModelCommand,
	InvokeModelCommandInput,
	InvokeModelCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import sharp from 'sharp';
import {
	S3Client,
} from '@aws-sdk/client-s3';
import {
	PutInputVector,
	PutVectorsCommand,
	PutVectorsCommandInput,
	S3VectorsClient,
} from '@aws-sdk/client-s3vectors';
import {
	KinesisClient,
	PutRecordsCommand,
	PutRecordsRequestEntry,
	PutRecordsResultEntry,
} from '@aws-sdk/client-kinesis';
import {
  FetchedImage,
  KinesisFailureEntry,
  SQSMessageBody,
  UpdateEmbeddingMessage,
  ValidVector
} from "./models";
import {CachedImageResolver, ImageResolver, S3ImageResolver} from "./imageResolver";
import {S3Fetcher} from "./s3Fetcher";

// Initialise clients at module level (cold start only)
const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT;
const isLocal = process.env.IS_LOCAL === 'true';

// Determine stage: dev for local, otherwise from environment (test or prod)
const STAGE = isLocal ? 'dev' : process.env.STAGE;

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
const THRALL_KINESIS_STREAM_ARN = process.env.THRALL_KINESIS_STREAM_ARN;

const s3Client = new S3Client({
	region: 'eu-west-1',
	...localStackConfig,
});
const s3VectorsClient = new S3VectorsClient({ region: 'eu-central-1' });

async function sendEmbeddingsToKinesis(
	stage: string | undefined,
	vectors: ValidVector[],
	client: KinesisClient,
	imageIdToMessageId: Map<string, string>,
	batchItemFailures: SQSBatchItemFailure[],
) {
	// Send embeddings to Kinesis for Thrall to write to Elasticsearch
	if (stage === 'PROD') {
		console.log(`Not writing embeddings to Kinesis yet whilst we test on TEST`);
	} else {
		const failedImageIds = await putRecordsToKinesis(vectors, client);
		for (const imageId of failedImageIds) {
			const messageId = imageIdToMessageId.get(imageId);
			if (messageId) {
				console.log(
					`Error writing image with ID ${imageId} to Kinesis, adding as batchItemFailure`,
				);
				batchItemFailures.push({ itemIdentifier: messageId });
			}
		}
	}
}

async function putRecordsToKinesis(
	vectors: ValidVector[],
	client: KinesisClient,
) {
	const records: PutRecordsRequestEntry[] = vectors.map((v) => {
		const message: UpdateEmbeddingMessage = {
			_type: 'com.gu.mediaservice.model.UpdateEmbeddingMessage',
			lastModified: new Date().toISOString(),
			id: v.key,
			embedding: {
				cohereEmbedEnglishV3: {
					image: v.data.float32,
				},
			},
		};
		return {
			PartitionKey: v.key,
			Data: Buffer.from(JSON.stringify(message)),
		};
	});

	console.log(`Writing ${records.length} embeddings to Kinesis stream...`);

	const command = new PutRecordsCommand({
		StreamARN: THRALL_KINESIS_STREAM_ARN,
		Records: records,
	});

	try {
		const response = await client.send(command);

		if (response.Records?.length !== records.length) {
			throw new Error(
				`Unexpected Kinesis response: expected ${records.length} fully-populated records, got ${response.Records?.length ?? 0}`,
			);
		}

		const responseRecords: PutRecordsResultEntry[] = response.Records;

		const failures = responseRecords.filter(
			(r): r is KinesisFailureEntry => !!r.ErrorCode,
		);

		console.log(
			`Published ${responseRecords.length - failures.length} embeddings to Kinesis (${failures.length} failed)`,
		);

		const failedImageIds = failures.map((failure) => {
			const index = responseRecords.indexOf(failure);
			return vectors[index].key;
		});

		return failedImageIds;
	} catch (error) {
		console.error(`Error writing to Kinesis:`, error);
		throw error;
	}
}



export async function embedImage(
	imageBytes: Uint8Array,
	imageMimeType: string,
	bedrockClient: BedrockRuntimeClient,
): Promise<InvokeModelCommandOutput> {
	const base64Image = Buffer.from(imageBytes).toString('base64');
	const model = 'cohere.embed-english-v3';
	const body = {
		input_type: 'image',
		embedding_types: ['float'],
		images: [`data:${imageMimeType};base64,${base64Image}`],
	};

	const input: InvokeModelCommandInput = {
		modelId: model,
		body: JSON.stringify(body),
		accept: '*/*',
		contentType: 'application/json',
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
		indexName: 'cohere-embed-english-v3',
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

	// At AWS office hour they recommended to re-initialise the client each handler invocation
	// as a temporary fix whilst AWS investigates the Bedrock server issues
	// This is to avoid the TCP connection from the client to timeout whilst we're waiting for Bedrock to respond
	// See https://aws.amazon.com/blogs/networking-and-content-delivery/implementing-long-running-tcp-connections-within-vpc-networking/
	const bedrockClientStart = performance.now();
	const bedrockClient = new BedrockRuntimeClient({
		region: 'eu-west-1',
		logger: new LogLevel('debug', console),
		requestHandler: {
			// We set hard timeouts to prevent the client simply hanging if the server
			// is not behaving correctly. We have seen this behaviour in production
			// when requests to Bedrock have exceeded 2000 per minute,
			// causing lambda timeouts and cascading failures.
			// The specific values here were recommended by our friend at AWS Support, Abhishek M.,
			// in this support ticket:
			// https://563563610310-jmoumez6.support.console.aws.amazon.com/support/home?region=eu-west-1#/case/?displayId=177202106800750&language=en
			connectionTimeout: 3_000,
			requestTimeout: 30_000,
		},
	});
	const bedrockClientDuration = performance.now() - bedrockClientStart;
	console.log(
		`BedrockRuntimeClient created in ${bedrockClientDuration.toFixed(2)}ms`,
	);

  const s3Fetcher = new S3Fetcher(s3Client);
  const imageResolver = new CachedImageResolver(
    new S3ImageResolver(s3Fetcher),
    s3Fetcher,
    s3Client,
    DOWNSCALED_IMAGE_BUCKET,
  )

	const { vectors, batchItemFailures, imageIdToMessageId } =
		await generateVectors(event.Records, imageResolver, bedrockClient);

	if (vectors.length > 0) {
		await sendEmbeddingsToKinesis(
			STAGE,
			vectors,
			kinesisClient,
			imageIdToMessageId,
			batchItemFailures,
		);
		await storeEmbeddingsInS3VectorStore(vectors, s3VectorsClient);
	} else {
		console.log(`No vectors to store`);
	}

	return { batchItemFailures };
};
