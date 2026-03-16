import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { sdkStreamMixin } from '@smithy/util-stream';
import { Readable } from 'stream';
import {S3Fetcher} from "../src/s3Fetcher";
import {S3ImageResolver} from "../src/imageResolver";


const s3Mock = mockClient(S3Client);
const client = new S3Client({});
const imageFetcher = new S3Fetcher(client);
const s3ImageResolver = new S3ImageResolver(imageFetcher);

// Declare the contents of the mock S3 bucket.
// Keys not listed will 404.
function mockS3BucketContents(keys: string[]): Record<string, Uint8Array> {
	const objects = Object.fromEntries(
		keys.map((key, i) => [key, new Uint8Array([i])]),
	);
	s3Mock.reset();
	s3Mock.on(GetObjectCommand).callsFake(async (input) => {
		const bytes = objects[input.Key!];
		if (!bytes) {
			const error = new Error('NoSuchKey');
			error.name = 'NoSuchKey';
			throw error;
		}
		return { Body: sdkStreamMixin(Readable.from([bytes])) };
	});
	return objects;
}

function requestedKeys(): string[] {
	return s3Mock.commandCalls(GetObjectCommand).map((c) => c.args[0].input.Key!);
}

describe('fetchImage', () => {
	describe('JPEGs', () => {
		it('fetches the original directly', async () => {
			const s3 = mockS3BucketContents(['a/b/c/abc123']);

			const result = await s3ImageResolver.fetchImage(
				{
					imageId: 'abc123',
					s3Bucket: 'test-bucket',
					s3Key: 'a/b/c/abc123',
					fileType: 'image/jpeg',
				},
			);

			expect(result).toEqual({
				bytes: s3['a/b/c/abc123'],
				mimeType: 'image/jpeg',
			});
			expect(requestedKeys()).toEqual(['a/b/c/abc123']);
		});

		it('throws when the original is missing', async () => {
			mockS3BucketContents([]);

			await expect(
        s3ImageResolver.fetchImage(
					{
						imageId: 'abc123',
						s3Bucket: 'test-bucket',
						s3Key: 'a/b/c/abc123',
						fileType: 'image/jpeg',
					},
				),
			).rejects.toThrow('Failed to retrieve image');
		});

		it('does not try optimised even if present when original is not', async () => {
			mockS3BucketContents(['optimised/a/b/c/abc123']);

			await expect(
        s3ImageResolver.fetchImage(
					{
						imageId: 'abc123',
						s3Bucket: 'test-bucket',
						s3Key: 'a/b/c/abc123',
						fileType: 'image/jpeg',
					},
				),
			).rejects.toThrow('Failed to retrieve image');
		});
	});

	describe('PNGs', () => {
		it('uses the optimised PNG in preference to the original, when both exist', async () => {
			const s3 = mockS3BucketContents([
				'optimised/a/b/c/abc123',
				'a/b/c/abc123',
			]);

			const result = await s3ImageResolver.fetchImage(
				{
					imageId: 'abc123',
					s3Bucket: 'test-bucket',
					s3Key: 'a/b/c/abc123',
					fileType: 'image/png',
				},
			);

			expect(result).toEqual({
				bytes: s3['optimised/a/b/c/abc123'],
				mimeType: 'image/png',
			});
			expect(requestedKeys()).toEqual(['optimised/a/b/c/abc123']);
		});

		it('uses the optimised PNG when original does not exist', async () => {
			const s3 = mockS3BucketContents(['optimised/a/b/c/abc123']);

			const result = await s3ImageResolver.fetchImage(
				{
					imageId: 'abc123',
					s3Bucket: 'test-bucket',
					s3Key: 'a/b/c/abc123',
					fileType: 'image/png',
				},
			);

			expect(result).toEqual({
				bytes: s3['optimised/a/b/c/abc123'],
				mimeType: 'image/png',
			});
			expect(requestedKeys()).toEqual(['optimised/a/b/c/abc123']);
		});

		it('falls back to original when optimised is missing', async () => {
			const s3 = mockS3BucketContents(['a/b/c/abc123']);

			const result = await s3ImageResolver.fetchImage(
				{
					imageId: 'abc123',
					s3Bucket: 'test-bucket',
					s3Key: 'a/b/c/abc123',
					fileType: 'image/png',
				},
			);

			expect(result).toEqual({
				bytes: s3['a/b/c/abc123'],
				mimeType: 'image/png',
			});
			// It tried the optimised, couldn't find it, so then tried the original
			expect(requestedKeys()).toEqual([
				'optimised/a/b/c/abc123',
				'a/b/c/abc123',
			]);
		});

		it('throws when both optimised and original are missing', async () => {
			mockS3BucketContents([]);

			await expect(
        s3ImageResolver.fetchImage(
					{
						imageId: 'abc123',
						s3Bucket: 'test-bucket',
						s3Key: 'a/b/c/abc123',
						fileType: 'image/png',
					},
				),
			).rejects.toThrow('Failed to retrieve image');
		});

		it("uses the key directly when it's already an optimised path", async () => {
			const s3 = mockS3BucketContents(['optimised/a/b/c/abc123']);

			const result = await s3ImageResolver.fetchImage(
				{
					imageId: 'abc123',
					s3Bucket: 'test-bucket',
					s3Key: 'optimised/a/b/c/abc123',
					fileType: 'image/png',
				},
			);

			expect(result).toEqual({
				bytes: s3['optimised/a/b/c/abc123'],
				mimeType: 'image/png',
			});
			expect(requestedKeys()).toEqual(['optimised/a/b/c/abc123']);
		});
	});

	describe('TIFFs', () => {
		it('uses the optimised PNG in place of the original, when both exist', async () => {
			const s3 = mockS3BucketContents([
				'a/b/c/abc123',
				'optimised/a/b/c/abc123',
			]);

			const result = await s3ImageResolver.fetchImage(
				{
					imageId: 'abc123',
					s3Bucket: 'test-bucket',
					s3Key: 'a/b/c/abc123',
					fileType: 'image/tiff',
				},
			);

			expect(result).toEqual({
				bytes: s3['optimised/a/b/c/abc123'],
				mimeType: 'image/png',
			});
			expect(requestedKeys()).toEqual(['optimised/a/b/c/abc123']);
		});

		it('uses the optimised PNG when original does not exist', async () => {
			const s3 = mockS3BucketContents(['optimised/a/b/c/abc123']);

			const result = await s3ImageResolver.fetchImage(
				{
					imageId: 'abc123',
					s3Bucket: 'test-bucket',
					s3Key: 'a/b/c/abc123',
					fileType: 'image/tiff',
				},
			);

			expect(result).toEqual({
				bytes: s3['optimised/a/b/c/abc123'],
				mimeType: 'image/png',
			});
			expect(requestedKeys()).toEqual(['optimised/a/b/c/abc123']);
		});

		it('throws when neither original TIFF nor optimised PNG exists', async () => {
			mockS3BucketContents([]);

			await expect(
        s3ImageResolver.fetchImage(
					{
						imageId: 'abc123',
						s3Bucket: 'test-bucket',
						s3Key: 'a/b/c/abc123',
						fileType: 'image/tiff',
					},
				),
			).rejects.toThrow('Unsupported file type: image/tiff');
		});

		it('throws when no optimised PNG exists, even if the original TIFF exists', async () => {
			mockS3BucketContents(['a/b/c/abc123']);

			await expect(
        s3ImageResolver.fetchImage(
					{
						imageId: 'abc123',
						s3Bucket: 'test-bucket',
						s3Key: 'a/b/c/abc123',
						fileType: 'image/tiff',
					},
				),
			).rejects.toThrow('Unsupported file type: image/tiff');
		});
	});
});
