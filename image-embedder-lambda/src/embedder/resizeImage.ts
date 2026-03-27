import sharp from "sharp";

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
