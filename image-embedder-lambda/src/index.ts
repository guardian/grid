// We are going to write to an SQS queue in image loader instead
// We want to make sure that we only write to the queue at the very end, 
// when the record is successfully in ES
// Then the handler will embed and can do it in batches
// It's not easy to get it to take batches of 10 at a time but we can investigate 
// Whether it's worth it to do that 
// We can also reuse the lambda for the backfill

// Send the S3 link to the image via image-loader

import { Context, SQSEvent, SQSRecord } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelCommandInput, InvokeModelCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { GetObjectCommand, GetObjectCommandOutput, GetObjectRequest, S3Client } from "@aws-sdk/client-s3"

const model: string = "cohere.embed-english-v3";
const bedrockClient = new BedrockRuntimeClient({
    region: "eu-west-1"
});
const s3Client = new S3Client({region: "eu-west-1"})
interface SQSMessageBody {
    imageId: string;
    bucket: string;
    filePath: string;
}

async function getImageFromS3(bucket: string, filePath: string): Promise<Uint8Array | undefined> {
    
    const input: GetObjectRequest = {
        Bucket: bucket,
        Key: filePath,
    };

    console.log(`Fetching image from S3: bucket=${bucket}, key=${filePath}`);

    try {
        const command = new GetObjectCommand(input);
        const response: GetObjectCommandOutput = await s3Client.send(command);
        
        if (!response) {
            console.log(`Returning undefined: no response object`);
            return undefined;
        }

        // Log response metadata for debugging
        console.log(`Response metadata: ${JSON.stringify(response.$metadata)}`);
        console.log(`Content-Length: ${response.ContentLength}`);
        console.log(`Content-Type: ${response.ContentType}`);
        console.log(`Body type: ${response.Body?.constructor.name}`);

        if (!response.Body) {
            console.log(`Returning undefined: response.Body is falsy`);
            return undefined;
        }

        if (response.ContentLength === 0) {
            console.log(`Warning: ContentLength is 0, file may be empty`);
        }

        const bytes = await response.Body.transformToByteArray();
        console.log(`Bytes array length: ${bytes.length}`);
        return bytes;
    } catch (error) {
        console.error(`Error fetching from S3:`, error);
        if (error instanceof Error) {
            console.error(`Error name: ${error.name}`);
            console.error(`Error message: ${error.message}`);
            console.error(`Error stack: ${error.stack}`);
        }
        throw error;
    }
}

async function embedImage(inputData: String[]): Promise<InvokeModelCommandOutput> {
    const body = {
        input_type: "image",
        embedding_types: ["float"],
        images: inputData
    };
    const jsonBody = JSON.stringify(body);
 
    const input: InvokeModelCommandInput = {
        modelId: model,
        body: jsonBody,
        accept: "*/*",
        contentType: "application/json",
    }
    console.log(`Invoking Bedrock model: ${model}`);
    
    try {
        const command = new InvokeModelCommand(input);
        const response = await bedrockClient.send(command);
        
        console.log(`Bedrock response metadata: ${JSON.stringify(response.$metadata)}`);
        console.log(`Response body length: ${response.body?.length}`);
        
        return response;
    } catch (error) {
        console.error(`Bedrock invocation error:`, error);
        if (error instanceof Error) {
            console.error(`Error name: ${error.name}`);
            console.error(`Error message: ${error.message}`);
        }
        throw error;
    }
}

export const handler = async (event: SQSEvent, context: Context) => {

    console.log(`Starting handler embedding pipeline`);
    const records: SQSRecord[] = event.Records;
    const recordBody: SQSMessageBody = JSON.parse(records[0].body);
    
    const gridImage = await getImageFromS3(recordBody.bucket, recordBody.filePath);

    const base64Image = Buffer.from(gridImage).toString('base64');
    const inputImage = `data:image/jpg;base64,${base64Image}`

    // TODO: downscale image if neceesary

    const embedding = await embedImage([inputImage]);

};