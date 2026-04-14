import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
  InvokeModelCommandOutput
} from "@aws-sdk/client-bedrock-runtime";
import {LogLevel} from "@aws-sdk/config/logger";


export function createBedrockClient(): BedrockRuntimeClient {
  const bedrockClientStart = performance.now();
  const bedrockClient = new BedrockRuntimeClient({
    region: 'eu-west-1',
    logger: new LogLevel('debug', console),
    requestHandler: {
      // We set hard timeouts to prevent the client simply hanging if the server
      // is not behaving correctly. We have seen this behaviour in production
      // when requests to Bedrock have exceeded 2000 per minute,
      // causing lambda timeouts and cascading failures.
      // The specific values here were recommended by our friend at AWS Support, Abhishek M.,
      // in this support ticket:
      // https://563563610310-jmoumez6.support.console.aws.amazon.com/support/home?region=eu-west-1#/case/?displayId=177202106800750&language=en
      connectionTimeout: 3_000,
      requestTimeout: 30_000,
    },
  });
  const bedrockClientDuration = performance.now() - bedrockClientStart;
  console.log(
    `BedrockRuntimeClient created in ${bedrockClientDuration.toFixed(2)}ms`,
  );

  return bedrockClient;
}

export async function embedImage(
  imageBytes: Uint8Array,
  imageMimeType: string,
  bedrockClient: BedrockRuntimeClient,
): Promise<InvokeModelCommandOutput> {
  const base64Image = Buffer.from(imageBytes).toString('base64');
  const model = 'global.cohere.embed-v4:0';

  const body = {
    input_type: 'search_document',
    embedding_types: ['float'],
    images: [`data:${imageMimeType};base64,${base64Image}`],
    output_dimension: 1536,
  }

  const input: InvokeModelCommandInput = {
    modelId: model,
    body: JSON.stringify(body),
    accept: '*/*',
    contentType: 'application/json',
  };
  console.log(`Invoking Bedrock model: ${model}`);

  try {
    const embedStart = performance.now();
    const command = new InvokeModelCommand(input);
    const response = await bedrockClient.send(command);
    const embedMs = performance.now() - embedStart;

    console.log(
      `Embedding took ${embedMs.toFixed(0)}ms, response ${response.body?.length.toLocaleString()} bytes, metadata: ${JSON.stringify(response.$metadata)}`,
    );

    return response;
  } catch (error) {
    console.error(`Bedrock invocation error:`, error);
    throw error;
  }
}
