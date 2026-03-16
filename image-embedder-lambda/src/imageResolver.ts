import {SQSMessageBody} from "./models";
import {S3Fetcher} from "./s3Fetcher";
import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {MAX_IMAGE_SIZE_BYTES, MAX_PIXELS_COHERE_V4} from "./constants";
import {downscaleImageIfNeeded} from "./index";

export interface FetchedImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ImageResolver {
  fetchImage(
    message: SQSMessageBody,
  ): Promise<FetchedImage>
}

export class S3ImageResolver implements ImageResolver {
  s3Fetcher: S3Fetcher
  constructor(s3Fetcher: S3Fetcher) {
    this.s3Fetcher = s3Fetcher;
  }

  // For TIFFs and PNGs, try the optimised PNG first — it's smaller and always a supported format.
  // Essential for TIFFs (Cohere rejects them), nice-to-have for PNGs (less downscaling).
  async fetchImage(
    message: SQSMessageBody,
  ): Promise<FetchedImage> {
    const isAlreadyOptimised = message.s3Key.startsWith('optimised/');
    const shouldCheckForOptimised =
      message.fileType === 'image/tiff' || message.fileType === 'image/png';

    if (shouldCheckForOptimised && !isAlreadyOptimised) {
      const optimisedKey = `optimised/${message.s3Key}`;
      const bytes = await this.s3Fetcher.fetch(message.s3Bucket, optimisedKey);
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

    const bytes = await this.s3Fetcher.fetch(message.s3Bucket, message.s3Key);
    if (!bytes) {
      throw new Error(
        `Failed to retrieve image from S3 for image ${message.imageId}`,
      );
    }

    return { bytes, mimeType: message.fileType };
  }
}

// Wraps around an S3ImageResolver and cache any image that requires to be resized
export class CachedImageResolver implements ImageResolver {
  s3ImageResolver: S3ImageResolver
  s3Fetcher: S3Fetcher
  s3Client: S3Client
  downScaledImageBucket?: string
  constructor(
    s3ImageResolver: S3ImageResolver,
    s3Fetcher: S3Fetcher,
    s3Client: S3Client,
    downScaledImageBucket?: string
  ) {
    this.s3ImageResolver = s3ImageResolver;
    this.s3Fetcher = s3Fetcher;
    this.s3Client = s3Client;
    this.downScaledImageBucket = downScaledImageBucket;
  }

  // Matches the partitioned key structure used by Grid's image bucket for S3 performance at scale
  // e.g. imageId "51bfb4107d1640aa74c45aaa51985e4e03852440" → "5/1/b/f/b/4/51bfb4107d1640aa74c45aaa51985e4e03852440"
  private toPartitionedKey(imageId: string): string {
    const prefix = imageId.slice(0, 6).split('').join('/');
    return `${prefix}/${imageId}`;
  }

  async fetchCachedDownscaledImage(
    imageId: string,
  ): Promise<Uint8Array | undefined> {
    if (!this.downScaledImageBucket) {
      console.log(`No downscaled image bucket configured, skipping cache lookup`);
      return undefined;
    }

    const key = this.toPartitionedKey(imageId);
    const bytes = await this.s3Fetcher.fetch(this.downScaledImageBucket, key);
    if (bytes) {
      console.log(
        `Cache hit: found downscaled image for ${imageId} (${bytes.length.toLocaleString()} bytes)`,
      );
    } else {
      console.log(`Cache miss: no downscaled image for ${imageId}`);
    }
    return bytes;
  }

  async cacheDownscaledImage(
    imageId: string,
    imageBytes: Uint8Array,
    mimeType: string,
  ): Promise<void> {
    if (!this.downScaledImageBucket) {
      console.log(
        'No DOWNSCALED_IMAGE_BUCKET set, will not cache downscaled image',
      );
      return;
    }

    const key = this.toPartitionedKey(imageId);
    try {
      const command = new PutObjectCommand({
        Bucket: this.downScaledImageBucket,
        Key: key,
        Body: imageBytes,
        ContentType: mimeType,
      });
      await this.s3Client.send(command);
      console.log(
        `Cached downscaled image for ${imageId} (${imageBytes.length.toLocaleString()} bytes)`,
      );
    } catch (error) {
      // Log but don't throw - cache failures shouldn't break the pipeline
      console.warn(`Failed to cache downscaled image for ${imageId}:`, error);
    }
  }

  async fetchImage(
    message: SQSMessageBody
  ): Promise<FetchedImage> {
    // The mimeType of fully-processed (downscaled/converted) images is deterministic:
    // TIFFs are always served as their optimised PNG, all others keep their original format.
    const processedMimeType =
      message.fileType === 'image/tiff' ? 'image/png' : message.fileType;

    const cachedBytes = await this.fetchCachedDownscaledImage(message.imageId);
    if (cachedBytes) {
      return { bytes: cachedBytes, mimeType: processedMimeType };
    }

    const { bytes, mimeType } = await this.s3ImageResolver.fetchImage(message);
    const downscaled = await downscaleImageIfNeeded(
      bytes,
      mimeType,
      MAX_IMAGE_SIZE_BYTES,
      MAX_PIXELS_COHERE_V4,
    );

    if (downscaled !== bytes) {
      await this.cacheDownscaledImage(message.imageId, downscaled, mimeType);
    }

    return { bytes: downscaled, mimeType };
  }
}
