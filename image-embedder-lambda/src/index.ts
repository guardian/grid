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
	ImageBlock$,
	InvokeModelCommand,
	InvokeModelCommandInput,
	InvokeModelCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import sharp from 'sharp';
import {
	GetObjectCommand,
	GetObjectCommandOutput,
	GetObjectRequest,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import {
	PutInputVector,
	PutVectorsCommand,
	PutVectorsCommandInput,
	S3VectorsClient,
} from '@aws-sdk/client-s3vectors';
import { MAX_IMAGE_SIZE_BYTES, MAX_PIXELS_COHERE_V4 } from './constants';
import {
	KinesisClient,
	PutRecordsCommand,
	PutRecordsRequestEntry,
	PutRecordsResultEntry,
} from '@aws-sdk/client-kinesis';

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
const s3VectorsClient = new S3VectorsClient({ region: 'eu-central-1' });

export interface SQSMessageBody {
	imageId: string;
	s3Bucket: string;
	s3Key: string;
	fileType: string;
}

interface CohereV3Embedding {
	image: number[];
}

interface Embedding {
	cohereEmbedEnglishV3: CohereV3Embedding;
}

interface Embeddings {
	imageId: string;
	embedding: Embedding;
}
export interface FetchedImage {
	bytes: Uint8Array;
	mimeType: string;
}

// For TIFFs and PNGs, try the optimised PNG first — it's smaller and always a supported format.
// Essential for TIFFs (Cohere rejects them), nice-to-have for PNGs (less downscaling).
export async function fetchImage(
	message: SQSMessageBody,
	client: S3Client,
): Promise<FetchedImage> {
	const isAlreadyOptimised = message.s3Key.startsWith('optimised/');
	const shouldCheckForOptimised =
		message.fileType === 'image/tiff' || message.fileType === 'image/png';

	if (shouldCheckForOptimised && !isAlreadyOptimised) {
		const optimisedKey = `optimised/${message.s3Key}`;
		const bytes = await getImageFromS3(message.s3Bucket, optimisedKey, client);
		if (bytes) {
			console.log(`Using optimised PNG for ${message.imageId}`);
			return { bytes, mimeType: 'image/png' };
		}
		console.log(
			`No optimised PNG for ${message.imageId}, falling back to original`,
		);
	}

	if (message.fileType === 'image/tiff') {
		throw new Error(
			`Unsupported file type: image/tiff for image ${message.imageId} (no optimised PNG found)`,
		);
	}

	const bytes = await getImageFromS3(message.s3Bucket, message.s3Key, client);
	if (!bytes) {
		throw new Error(
			`Failed to retrieve image from S3 for image ${message.imageId}`,
		);
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
		if (error instanceof Error && error.name === 'NoSuchKey') {
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
		`Image has ${imageBytes.length.toLocaleString()} bytes (${bytesExceedsLimit ? 'over' : 'within'} limit of ${maxImageSizeBytes.toLocaleString()} bytes), ${pixels.toLocaleString()} px (${pixelsExceedsLimit ? 'over' : 'within'} limit of ${maxPixels.toLocaleString()} px) → ${needsDownscale ? 'downscaling' : 'no resize needed'}`,
	);
	if (!needsDownscale) {
		console.log(
			`Downscale check took ${(performance.now() - start).toFixed(0)}ms (no resize)`,
		);
		return imageBytes;
	}

	const pixelRatio = maxPixels / pixels;

	// Why square root? Because the ratio comes from the multiplied width * height,
	// but we want to use it to scale just the width.
	const scaleFactor = Math.sqrt(pixelRatio);
	// Floor because we want to make sure we're under the limit afterwards
	const newWidth = Math.floor(width * scaleFactor);

	sharpImage = sharpImage.resize(newWidth);

	if (mimeType === 'image/jpeg') {
		// JPEG compression is lossy, so let's be conservative here.
		// Also, 95 matches what we do for master crops:
		// https://github.com/guardian/grid/blob/40be8f93f8a6da61c8188332c8e98796dc351ecd/cropper/app/lib/Crops.scala#L24
		sharpImage = sharpImage.jpeg({ quality: 95 });
	} else if (mimeType === 'image/png') {
		// PNG compression is lossless, so let's crank it to the max
		sharpImage = sharpImage.png({ compressionLevel: 9 });
	}

	const buffer = await sharpImage.toBuffer();
	const result = new Uint8Array(buffer);

	// Q. Why not calculate height ourselves?
	// A. We want the same rounding that sharp uses when it auto-resizes
	// Q. Why not read the new height from the existing `sharpImage` object?
	// A. Surprisingly, metadata doesn't get updated on calling resize. We need to output to buffer first.
	// To be honest this probably a waste of memory. Do we really care about a rounding error?
	// All we use it for is logging.
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
	const prefix = imageId.slice(0, 6).split('').join('/');
	return `${prefix}/${imageId}`;
}

async function fetchCachedDownscaledImage(
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
		console.log(
			`Cache hit: found downscaled image for ${imageId} (${bytes.length.toLocaleString()} bytes)`,
		);
	} else {
		console.log(`Cache miss: no downscaled image for ${imageId}`);
	}
	return bytes;
}

// Message format matching Scala's ExternalThrallMessage serialisation.
// Play JSON uses a `_type` discriminator field with the fully qualified class name.
interface UpdateEmbeddingMessage {
	_type: 'com.gu.mediaservice.model.UpdateEmbeddingMessage';
	id: string;
	embedding: {
		cohereEmbedEnglishV3: {
			image: number[];
		};
	};
}

// A successful Kinesis result always has SequenceNumber and ShardId.
// A failed result always has ErrorCode and ErrorMessage.
// Every record is one or the other.
interface KinesisSuccessEntry extends PutRecordsResultEntry {
	SequenceNumber: string;
	ShardId: string;
	ErrorCode?: undefined;
	ErrorMessage?: undefined;
}

interface KinesisFailureEntry extends PutRecordsResultEntry {
	SequenceNumber?: undefined;
	ShardId?: undefined;
	ErrorCode: string;
	ErrorMessage: string;
}

type KinesisResultEntry = KinesisSuccessEntry | KinesisFailureEntry;

// A PutInputVector with guaranteed key and float32 data.
interface ValidVector extends PutInputVector {
	key: string;
	data: { float32: number[] };
}

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

async function cacheDownscaledImage(
	imageId: string,
	imageBytes: Uint8Array,
	mimeType: string,
	client: S3Client,
): Promise<void> {
	if (!DOWNSCALED_IMAGE_BUCKET) {
		console.log(
			'No DOWNSCALED_IMAGE_BUCKET set, will not cache downscaled image',
		);
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
		console.log(
			`Cached downscaled image for ${imageId} (${imageBytes.length.toLocaleString()} bytes)`,
		);
	} catch (error) {
		// Log but don't throw - cache failures shouldn't break the pipeline
		console.warn(`Failed to cache downscaled image for ${imageId}:`, error);
	}
}

export async function fetchImageAndDownscaleIfNeeded(
	message: SQSMessageBody,
	client: S3Client,
): Promise<FetchedImage> {
	// The mimeType of fully-processed (downscaled/converted) images is deterministic:
	// TIFFs are always served as their optimised PNG, all others keep their original format.
	const processedMimeType =
		message.fileType === 'image/tiff' ? 'image/png' : message.fileType;

	const cachedBytes = await fetchCachedDownscaledImage(message.imageId, client);
	if (cachedBytes) {
		return { bytes: cachedBytes, mimeType: processedMimeType };
	}

	const { bytes, mimeType } = await fetchImage(message, client);
	const downscaled = await downscaleImageIfNeeded(
		bytes,
		mimeType,
		MAX_IMAGE_SIZE_BYTES,
		MAX_PIXELS_COHERE_V4,
	);

	if (downscaled !== bytes) {
		await cacheDownscaledImage(message.imageId, downscaled, mimeType, client);
	}

	return { bytes: downscaled, mimeType };
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
	s3Client: S3Client,
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
				await fetchImageAndDownscaleIfNeeded(recordBody, s3Client);

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

	const { vectors, batchItemFailures, imageIdToMessageId } =
		await generateVectors(event.Records, s3Client, bedrockClient);

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
