import {Context, EventBridgeEvent} from "aws-lambda";
import {SQSClient} from "@aws-sdk/client-sqs";
import {SQSMessageBody} from "../shared/sqsMessageBody";
import {ElasticSearchResponse, queryElasticSearch} from "./elasticSearch";
import {EmbedderQueue} from "./embedderQueue";

const ELASTIC_SEARCH_URL = process.env.ELASTIC_SEARCH_URL;
const BACKFILL_SQS_QUEUE = process.env.BACKFILL_SQS_QUEUE;

const BATCH_SIZE = 100;
const CROWDED_QUEUE = 20;

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT;

const localStackConfig = LOCALSTACK_ENDPOINT
  ? {
    endpoint: LOCALSTACK_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  }
  : {};

const sqsClient = new SQSClient({
  region: 'eu-west-1',
  ...localStackConfig,
});
const embedderQueue = new EmbedderQueue(sqsClient);

const elasticSearchResponseToSqsMessages = (esResponse: ElasticSearchResponse): SQSMessageBody[] => {
  return esResponse.hits?.filter((hit) => {
    return hit._id && hit._source?.source?.file && hit._source?.source?.mimeType
  }).map((hit) => {
    const fileUrl = hit._source.source.file;
    // parse the file URL to deduce the S3 bucket
    const parsedUrl = new URL(fileUrl);
    const s3Bucket = parsedUrl.hostname.split('.')[0];
    const s3Key = parsedUrl.pathname.split('/')[1];
    return {
      imageId: hit._id,
      s3Bucket: s3Bucket,
      s3Key: s3Key,
      fileType: hit._source.source.mimeType,
    }
  });
}

export const handler = async (
  event: EventBridgeEvent<"Scheduled Event", {}>,
  context: Context,
): Promise<void> => {
  console.log(`Starting handler embedding pipeline`);
  console.log("Checking queue size");
  const queueSize = await embedderQueue.checkQueueSize(BACKFILL_SQS_QUEUE!);
  if (queueSize > CROWDED_QUEUE) {
    console.log(`Backfill SQS queue has ${queueSize} messages, skipping this run to avoid overloading the queue`);
    return;
  } else {
    console.log(`Queue size has ${queueSize} messages, proceeding.`);
  }
  const esResults = await queryElasticSearch(BATCH_SIZE, ELASTIC_SEARCH_URL!);
  const sqsMessages = elasticSearchResponseToSqsMessages(esResults)
  console.log(`Found ${sqsMessages.length} images to process`, sqsMessages);
  if (sqsMessages.length > 0) {
    await embedderQueue.sendSqsMessages(sqsMessages, BACKFILL_SQS_QUEUE!);
    console.log(`Sent ${sqsMessages.length} messages to SQS queue ${BACKFILL_SQS_QUEUE}`);
  }
  console.log(`Done queuing ${sqsMessages.length} messages`);
}
