import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { S3Client } from '@aws-sdk/client-s3';
import { SQSRecord } from 'aws-lambda';
import { generateVectors } from '../../../src/embedder/embedder';
import {S3Fetcher} from "../../../src/embedder/s3Fetcher";
import {CachedImageResolver, S3ImageResolver} from "../../../src/embedder/imageResolver";
import {SQSMessageBody} from "../../../src/embedder/models";

/**
 * Integration tests for the fetch → downscale → embed pipeline.
 * Currently only intended to be manually triggered locally.
 *
 * Infrastructure used:
 *   SQS                          — not used (records are constructed in-memory)
 *   S3 source images             — AWS  (bucket: image-embedding-test)
 *   S3 downscaled image cache    — not used  (DOWNSCALED_IMAGE_BUCKET not set)
 *   Bedrock (Cohere embedding)   — AWS
 *   S3 Vectors                   — not used
 *
 * Note this does *not* currently test the caching behaviour of downscaled images,
 * because we have not set the DOWNSCALED_IMAGE_BUCKET env var for the lambda.
 *
 * Requires:
 *   - Valid AWS credentials with S3 and Bedrock permissions
 *   - Test images uploaded to image-embedding-test
 *   - For TIFF images: optimised PNGs at optimised/<key> in the same bucket
 *
 * Run with: npm run test:integration
 */

const TEST_BUCKET = 'image-embedding-test';

interface TestImage {
	name: string;
	imageId: string;
	s3Key: string;
	fileType: 'image/jpeg' | 'image/png' | 'image/tiff';
}

const TEST_IMAGES: TestImage[] = [
	{
		name: 'JPEG over 5 MB but just under 5 MiB',
		imageId: 'aaf514e9530271ab5639bb5f496eef97cdce9b7a',
		s3Key: 'large-images/aaf514e9530271ab5639bb5f496eef97cdce9b7a.jpeg',
		fileType: 'image/jpeg',
	},
	{
		name: 'JPEG just over 5 MiB',
		imageId: '5f8871b3686d06dadf3e7556cca2601c3b276288',
		s3Key: 'large-images/5f8871b3686d06dadf3e7556cca2601c3b276288.jpeg',
		fileType: 'image/jpeg',
	},
	{
		name: 'JPEG over 10 MB',
		imageId: 'fed92369dbbc961708ab883da815fc4c7f52597e',
		s3Key: 'large-images/fed92369dbbc961708ab883da815fc4c7f52597e.jpeg',
		fileType: 'image/jpeg',
	},
	{
		name: 'Small PNG',
		imageId: '339d129c0b0f47507f7d299bf28046d40c12d368',
		s3Key: 'pngs/339d129c0b0f47507f7d299bf28046d40c12d368.png',
		fileType: 'image/png',
	},
	{
		name: 'Large PNG',
		imageId: 'c2039d7b0ba13910d7f8147128b86199784465ae',
		s3Key: 'pngs/c2039d7b0ba13910d7f8147128b86199784465ae.png',
		fileType: 'image/png',
	},
	{
		name: 'Small TIFF',
		imageId: 'b927f8924960874eda447208baa3fe7963cba8c4',
		s3Key: 'tiffs/b927f8924960874eda447208baa3fe7963cba8c4',
		fileType: 'image/tiff',
	},
	{
		name: 'Large TIFF',
		imageId: '7d0b7c7b8e890d7e5d369093aa437bd833e20f71',
		s3Key: 'tiffs/7d0b7c7b8e890d7e5d369093aa437bd833e20f71',
		fileType: 'image/tiff',
	},
];

function makeSQSRecord(image: TestImage): SQSRecord {
	const body: SQSMessageBody = {
		imageId: image.imageId,
		s3Bucket: TEST_BUCKET,
		s3Key: image.s3Key,
		fileType: image.fileType,
	};
	return {
		messageId: image.imageId,
		receiptHandle: '',
		body: JSON.stringify(body),
		attributes: {
			ApproximateReceiveCount: '1',
			SentTimestamp: '0',
			SenderId: '',
			ApproximateFirstReceiveTimestamp: '0',
		},
		messageAttributes: {},
		md5OfBody: '',
		eventSource: 'aws:sqs',
		eventSourceARN: '',
		awsRegion: 'eu-west-1',
	};
}

describe('Fetch → downscale → embed pipeline', () => {
	const s3Client = new S3Client({ region: 'eu-west-1' });
	const bedrockClient = new BedrockRuntimeClient({ region: 'eu-west-1' });
  const s3Fetcher = new S3Fetcher(s3Client);
  const imageResolver = new CachedImageResolver(
    new S3ImageResolver(s3Fetcher),
    s3Fetcher,
    s3Client,
  )

	it.each(TEST_IMAGES)('should generate a vector for $name', async (image) => {
		const { vectors, batchItemFailures } = await generateVectors(
			[makeSQSRecord(image)],
      imageResolver,
			bedrockClient,
		);

		expect(batchItemFailures).toEqual([]);
		expect(vectors).toHaveLength(1);
		expect(vectors[0].key).toBe(image.imageId);
		expect(vectors[0].data?.float32?.length).toBe(1024);
	});
});
