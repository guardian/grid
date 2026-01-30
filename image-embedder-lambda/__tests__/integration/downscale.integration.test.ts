import { S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { downscaleImageIfNeeded, getImageFromS3 } from '../../src/index';
import {
	MAX_IMAGE_SIZE_BYTES,
	MAX_PIXELS_BEFORE_COHERE_V4_DOWNSAMPLING,
} from '../../src/constants';

const TEST_BUCKET = 'image-embedding-test';

interface ImageDimensions {
	width: number;
	height: number;
	pixels: number;
}

async function getImageDimensions(
	imageBytes: Uint8Array,
): Promise<ImageDimensions> {
	const metadata = await sharp(imageBytes).metadata();
	const width = metadata.width!;
	const height = metadata.height!;
	return { width, height, pixels: width * height };
}

interface DownscaleTestCase {
	s3Key: string;
	mimeType: 'image/jpeg' | 'image/png';
	inputWidth: number;
	inputHeight: number;
	inputBytes: number;
	expectedOutputWidth: number;
	expectedOutputHeight: number;
	expectedOutputPixels: number;
	expectedOutputBytes: number;
	shouldDownscale: boolean;
}

const TEST_CASES: DownscaleTestCase[] = [
	{
		s3Key: 'large-images/aaf514e9530271ab5639bb5f496eef97cdce9b7a.jpeg',
		mimeType: 'image/jpeg',
		inputWidth: 6976,
		inputHeight: 4634,
		inputBytes: 5_242_808,
		expectedOutputWidth: 1923,
		expectedOutputHeight: 1277,
		expectedOutputPixels: 2_455_671,
		expectedOutputBytes: 797_314,
		shouldDownscale: true,
	},
	{
		s3Key: 'large-images/5f8871b3686d06dadf3e7556cca2601c3b276288.jpeg',
		mimeType: 'image/jpeg',
		inputWidth: 3454,
		inputHeight: 2303,
		inputBytes: 5_242_970,
		expectedOutputWidth: 1920,
		expectedOutputHeight: 1280,
		expectedOutputPixels: 2_457_600,
		expectedOutputBytes: 643_568,
		shouldDownscale: true,
	},
	{
		s3Key: 'large-images/fed92369dbbc961708ab883da815fc4c7f52597e.jpeg',
		mimeType: 'image/jpeg',
		inputWidth: 5024,
		inputHeight: 3395,
		inputBytes: 10_360_979,
		expectedOutputWidth: 1907,
		expectedOutputHeight: 1288,
		expectedOutputPixels: 2_456_216,
		expectedOutputBytes: 492_622,
		shouldDownscale: true,
	},
	{
		s3Key: 'pngs/339d129c0b0f47507f7d299bf28046d40c12d368.png',
		mimeType: 'image/png',
		inputWidth: 725,
		inputHeight: 725,
		inputBytes: 131_137,
		expectedOutputWidth: 725,
		expectedOutputHeight: 725,
		expectedOutputPixels: 525_625,
		expectedOutputBytes: 131_137,
		shouldDownscale: false,
	},
	{
		s3Key: 'pngs/c2039d7b0ba13910d7f8147128b86199784465ae.png',
		mimeType: 'image/png',
		inputWidth: 3340,
		inputHeight: 5380,
		inputBytes: 16_368_332,
		expectedOutputWidth: 1235,
		expectedOutputHeight: 1990,
		expectedOutputPixels: 2_457_650,
		expectedOutputBytes: 3_900_827,
		shouldDownscale: true,
	},
];

function formatTestName(tc: DownscaleTestCase): string {
	const inputPixels = tc.inputWidth * tc.inputHeight;
	const input = `${tc.inputWidth}x${tc.inputHeight} (${inputPixels.toLocaleString()} px, ${tc.inputBytes.toLocaleString()} B)`;
	const output = `${tc.expectedOutputWidth}x${tc.expectedOutputHeight} (${tc.expectedOutputPixels.toLocaleString()} px, ${tc.expectedOutputBytes.toLocaleString()} B)`;
	return tc.shouldDownscale
		? `${tc.mimeType}: ${input} → ${output}`
		: `${tc.mimeType}: ${input} (no change needed)`;
}

describe('downscaleImageIfNeeded', () => {
	const s3Client = new S3Client({ region: 'eu-west-1' });

	for (const tc of TEST_CASES) {
		it(formatTestName(tc), async () => {
			const inputImage = await getImageFromS3(TEST_BUCKET, tc.s3Key, s3Client);
			if (!inputImage) {
				throw new Error(
					`Couldn't get image ${tc.s3Key} from bucket ${TEST_BUCKET}`,
				);
			}

			const inputDimensions = await getImageDimensions(inputImage);
			expect(inputDimensions.width).toBe(tc.inputWidth);
			expect(inputDimensions.height).toBe(tc.inputHeight);
			expect(inputImage.length).toBe(tc.inputBytes);

			const outputImage = await downscaleImageIfNeeded(
				inputImage,
				tc.mimeType,
				MAX_IMAGE_SIZE_BYTES,
				MAX_PIXELS_BEFORE_COHERE_V4_DOWNSAMPLING,
			);
			const outputDimensions = await getImageDimensions(outputImage);

			expect(outputDimensions.width).toBe(tc.expectedOutputWidth);
			expect(outputDimensions.height).toBe(tc.expectedOutputHeight);
			expect(outputDimensions.pixels).toBe(tc.expectedOutputPixels);
			expect(outputImage.length).toBe(tc.expectedOutputBytes);

			if (tc.shouldDownscale) {
				expect(outputImage.length).toBeLessThan(inputImage.length);
				expect(outputDimensions.pixels).toBeLessThanOrEqual(
					MAX_PIXELS_BEFORE_COHERE_V4_DOWNSAMPLING,
				);
			} else {
				expect(outputImage).toBe(inputImage);
			}

			expect(outputImage.length).toBeLessThanOrEqual(MAX_IMAGE_SIZE_BYTES);
		});
	}
});
