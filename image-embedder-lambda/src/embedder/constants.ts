// Bedrock Cohere v3 and v4 models have a 5 MiB limit for images
// https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed-v3.html#:~:text=and%20has%20a-,maximum%20size%20of%205MB
// The docs above say 5 MB, but we've proven with our integration tests that it is 5 MiB
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

// Cohere v3 doesn't specify a pixel size limit,
// but Cohere v4 downsamples images above this pixel count:
// https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed-v4.html#:~:text=Image%20sizing%3A-,Images%20%3E%202%2C458%2C624,-pixels%20are%20downsampled
// We use the lower bound of the models we can immediately foresee using.
export const MAX_PIXELS_COHERE_V4 = 2_458_624;
