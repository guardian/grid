/**
 * Uploads image files to S3 for the documents seed-elasticsearch.ts puts into Elasticsearch,
 * so the seeded images render (thumbnails, the single image view and imgops resizes).
 *
 * The fixture documents point at production bucket URLs, but media-api only reads the *path*
 * of each asset's `file` URL and signs it against its own configured buckets
 * (`s3.image.bucket` / `s3.thumb.bucket`). Uploading an object at that path in the local
 * ImageBucket and ThumbBucket is therefore all that is needed; the documents are untouched.
 *
 * The real originals are not available locally, so every image is backed by the same
 * placeholder JPEG.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { REPO_ROOT } from './constants.ts';
import { loadImageFixtures } from './image-fixtures.ts';
import type { StackProps } from './provision.ts';

const PLACEHOLDER_PATH = path.join(REPO_ROOT, 'e2e-tests', 'fixtures', 'images', 'test.jpg');
const PLACEHOLDER_MIME_TYPE = 'image/jpeg';

interface Asset {
  file?: string;
}

/** The S3 key media-api derives from an asset's `file` URL (see S3.signUrl). */
function keyOf(asset: Asset | undefined): string | undefined {
  return asset?.file ? new URL(asset.file).pathname.replace(/^\//, '') : undefined;
}

export async function seedImageFiles(
  s3: S3Client,
  coreStackProps: StackProps,
  report: (message: string) => void,
): Promise<void> {
  const body = fs.readFileSync(PLACEHOLDER_PATH);
  const { ImageBucket, ThumbBucket } = coreStackProps;

  const uploads = loadImageFixtures().flatMap(({ _source }) => [
    { bucket: ImageBucket, key: keyOf(_source.source as Asset) },
    { bucket: ThumbBucket, key: keyOf(_source.thumbnail as Asset) },
    // Media-api signs optimised PNGs against the image bucket too.
    { bucket: ImageBucket, key: keyOf(_source.optimisedPng as Asset | undefined) },
  ]);

  const toUpload = uploads.filter((u): u is { bucket: string; key: string } => !!u.key);

  await Promise.all(
    toUpload.map(({ bucket, key }) =>
      s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: PLACEHOLDER_MIME_TYPE }),
      ),
    ),
  );

  report(`Uploaded ${toUpload.length} image file(s) to S3 for the Elasticsearch fixtures`);
}
