// We are going to write to an SQS queue in image loader instead
// We want to make sure that we only write to the queue at the very end, 
// when the record is successfully in ES
// Then the handler will embed and can do it in batches
// It's not easy to get it to take batches of 10 at a time but we can investigate 
// Whether it's worth it to do that 
// We can also reuse the lambda for the backfill

import { Context, SQSEvent, SQSRecord } from 'aws-lambda';
// import { BedrockRuntimeClient, BedrockRuntimeClientConfig, InvokeModelCommand, InvokeModelCommandOutput } from "@aws-sdk/client-bedrock-runtime";
// import fetch from "node-fetch";
// import { GetObjectAclCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

// const model: string = "cohere.embed-english-v3";

// const bedrockClient = new BedrockRuntimeClient({
//     region: "eu-west-1"
// });

const GRID_API_KEY = process.env.GRID_API_KEY || "";

// async function getImageFromGrid(imageId: string, apiKey: string) {

//     const imageUri = `https://api.media.gutools.co.uk/images/${imageId}`;
//     console.log(`Fetching metadata for image from ${imageUri}`);
    
//     const response = await fetch(imageUri, {
//         headers: { "X-Gu-Media-Key": apiKey }
//     });
//     const imageMetadata = await response.json();
    
//     const secureUrl = imageMetadata.data.source.secureUrl;
//     console.log("Fetching image from secureUrl");
    
//     const imageResponse = await fetch(secureUrl);
//     const imageBytes = await imageResponse.arrayBuffer();
    
//     console.log(`The bytes string are: ${imageBytes}`);
//     return imageBytes;
// }

// async function getCredentials(s3Client: S3Client) {
    
//     const params = {
//         Bucket: "grid-conf",
//         Key: `TEST/image-embedder-lambda/conf.json`
//     };

//     const command = new GetObjectCommand(params)
    
//     const data = await s3Client.send(command)
//     const body = data.Body?.toString("utf8") || "";
    
//     return JSON.parse(body);  
// }

// async function embedImage(inputData: Array<String>): Promise<InvokeModelCommandOutput> {
//     const body = {
//         inputType: "image",
//         embeddingTypes: ["float"],
//         images: inputData
//     }
 
//     const input = {
//         modelId: model,
//         body: body,
//         accept: "*/*",
//         contentType: "application/json",
//     }
    
//     const command = new InvokeModelCommand(input);
    
//     const chatCompletion = await bedrockClient.send(command);
//     return chatCompletion
// }

export const handler = async (event: SQSEvent, context: Context) => {

    console.log(`Starting handler embedding pipeline`);
    const records: SQSRecord[] = event.Records;
    const recordBody = records[0].body
    console.log(`recordBody: ${recordBody}`);
    console.log(`secret (DUMMY VALUE ATM OBVS BECAUSE PRINTING): ${GRID_API_KEY}`);
};