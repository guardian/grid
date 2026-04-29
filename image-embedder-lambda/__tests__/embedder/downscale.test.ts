import sharp from 'sharp';
import {
	MAX_IMAGE_SIZE_BYTES,
	MAX_PIXELS_COHERE_V4,
} from '../../src/embedder/constants.ts';
import {
	ensureDirectoriesExist,
	writeOutputImage,
} from './integration/localTestFiles.ts';
import { downscaleImageIfNeeded } from '../../src/embedder/resizeImage.ts';
import path from 'path';

const TEST_IMAGE = path.join(__dirname, 'test-data', 'input', 'image.jpg');
const OUTPUT_DIR = path.join(__dirname, 'test-data', 'output');

interface ImageDimensions {
	width: number;
	height: number;
	pixels: number;
}

async function getImageDimensions(
	imageBytes: Uint8Array,
): Promise<ImageDimensions> {
	const { width, height } = await sharp(imageBytes).metadata();
	return { width, height, pixels: width * height };
}

interface DownscaleTestCase {
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
		mimeType: 'image/jpeg',
		inputWidth: 6976,
		inputHeight: 4634,
		inputBytes: 1_187_262,
		expectedOutputWidth: 212,
		expectedOutputHeight: 141,
		expectedOutputPixels: 29_892,
		expectedOutputBytes: 14964,
		shouldDownscale: true,
	},
	{
		mimeType: 'image/jpeg',
		inputWidth: 3454,
		inputHeight: 2303,
		inputBytes: 448_734,
		expectedOutputWidth: 212,
		expectedOutputHeight: 141,
		expectedOutputPixels: 29892,
		expectedOutputBytes: 15003,
		shouldDownscale: true,
	},
	{
		mimeType: 'image/jpeg',
		inputWidth: 5024,
		inputHeight: 3395,
		inputBytes: 761_420,
		expectedOutputWidth: 210,
		expectedOutputHeight: 142,
		expectedOutputPixels: 29820,
		expectedOutputBytes: 14858,
		shouldDownscale: true,
	},
	{
		mimeType: 'image/png',
		inputWidth: 173,
		inputHeight: 173,
		inputBytes: 74233,
		expectedOutputWidth: 173,
		expectedOutputHeight: 173,
		expectedOutputPixels: 29929,
		expectedOutputBytes: 74233,
		shouldDownscale: false,
	},
	{
		mimeType: 'image/png',
		inputWidth: 3340,
		inputHeight: 5380,
		inputBytes: 20_410_019,
		expectedOutputWidth: 136,
		expectedOutputHeight: 219,
		expectedOutputPixels: 29784,
		expectedOutputBytes: 64211,
		shouldDownscale: true,
	},
];

function resizeImageToFitTestCase(
	testCase: DownscaleTestCase,
	testCaseIndex: number,
): Promise<Uint8Array> {
	const sharpImage = sharp(TEST_IMAGE);
	sharpImage.resize(testCase.inputWidth, testCase.inputHeight);

	let outputPath = '';
	switch (testCase.mimeType) {
		case 'image/jpeg':
			sharpImage.jpeg({ quality: 95 });
			outputPath = path.join(OUTPUT_DIR, `${testCaseIndex}.jpg`);
			break;
		case 'image/png':
			sharpImage.png({ compressionLevel: 9 });
			outputPath = path.join(OUTPUT_DIR, `${testCaseIndex}.png`);
			break;
	}
	return sharpImage.toFile(outputPath).then(() => sharp(outputPath).toBuffer());
}

// Give test names like this,
// so we can see at a glance how much downscaling actually happened:
//  ✓ image/jpeg: 6976x4634 (32,326,784 px, 5,242,808 B) → 1923x1277 (2,455,671 px, 797,314 B)
function formatTestName(tc: DownscaleTestCase): string {
	const inputPixels = tc.inputWidth * tc.inputHeight;
	const input = `${tc.inputWidth}x${tc.inputHeight} (${inputPixels.toLocaleString()} px, ${tc.inputBytes.toLocaleString()} B)`;
	const output = `${tc.expectedOutputWidth}x${tc.expectedOutputHeight} (${tc.expectedOutputPixels.toLocaleString()} px, ${tc.expectedOutputBytes.toLocaleString()} B)`;
	return tc.shouldDownscale
		? `${tc.mimeType}: ${input} → ${output}`
		: `${tc.mimeType}: ${input} (no change needed)`;
}

describe(`Downscaling images to not exceed ${MAX_IMAGE_SIZE_BYTES.toLocaleString()} bytes and ${MAX_PIXELS_COHERE_V4.toLocaleString()} pixels`, () => {
	beforeAll(async () => {
		await ensureDirectoriesExist();
	});

	TEST_CASES.map((tc, index) => {
		it(formatTestName(tc), async () => {
			const inputImage = await resizeImageToFitTestCase(tc, index);

			const inputDimensions = await getImageDimensions(inputImage);
			expect(inputDimensions.width).toBe(tc.inputWidth);
			expect(inputDimensions.height).toBe(tc.inputHeight);
			expect(inputImage.length).toBe(tc.inputBytes);

			const outputImage = await downscaleImageIfNeeded(
				inputImage,
				tc.mimeType,
				MAX_IMAGE_SIZE_BYTES,
				MAX_PIXELS_COHERE_V4,
			);

			if (tc.shouldDownscale) {
				await writeOutputImage(outputImage, `${index}`, '_downscaled');
			}

			const outputDimensions = await getImageDimensions(outputImage);

			expect(outputDimensions.width).toBe(tc.expectedOutputWidth);
			expect(outputDimensions.height).toBe(tc.expectedOutputHeight);
			expect(outputDimensions.pixels).toBe(tc.expectedOutputPixels);
			expect(outputImage.length).toBe(tc.expectedOutputBytes);

			if (tc.shouldDownscale) {
				expect(outputImage.length).toBeLessThan(inputImage.length);
				expect(outputDimensions.pixels).toBeLessThanOrEqual(
					MAX_PIXELS_COHERE_V4,
				);
			} else {
				expect(outputImage).toBe(inputImage);
			}

			expect(outputImage.length).toBeLessThanOrEqual(MAX_IMAGE_SIZE_BYTES);
		});
	});
});
