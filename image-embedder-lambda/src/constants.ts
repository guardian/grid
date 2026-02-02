// Bedrock Cohere model has a 5 MiB limit for images
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

// Cohere v4 downsamples images above this pixel count
export const MAX_PIXELS_COHERE_V4 = 2_458_624;
