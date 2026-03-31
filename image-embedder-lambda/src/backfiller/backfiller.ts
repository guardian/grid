import 'source-map-support/register';
import {Context, EventBridgeEvent} from "aws-lambda";
import {SQSClient} from "@aws-sdk/client-sqs";
import {SQSMessageBody} from "../shared/sqsMessageBody";
import {queryElasticSearch, ElasticSearchSuccess} from "./elasticSearch";
import {EmbedderQueue} from "./embedderQueue";

const BATCH_SIZE = 100;
const CROWDED_QUEUE = 20;

const elasticSearchResponseToSqsMessages = (esResponse: ElasticSearchSuccess): SQSMessageBody[] => {
  console.debug("EsResponse", JSON.stringify(esResponse));
  return esResponse.hits?.hits?.filter((hit) => {
    return hit._id && hit._source?.source?.file && hit._source?.source?.mimeType
  }).map((hit) => {
    const fileUrl = hit._source.source.file;
    // parse the file URL to deduce the S3 bucket
    const parsedUrl = new URL(fileUrl);
    const s3Bucket = parsedUrl.hostname.split('.')[0];
    const s3Key = parsedUrl.pathname.startsWith('/') ? parsedUrl.pathname.slice(1) : parsedUrl.pathname;
    return {
      imageId: hit._id,
      s3Bucket: s3Bucket,
      s3Key: s3Key,
      fileType: hit._source.source.mimeType,
    }
  });
}

export const backfillOneBatch = async (
  sqsQueueUrl: string,
  elasticSearchUrl: string,
  imageIndexName: string,
  sqsClient: SQSClient,
  context: Context,
): Promise<void> => {
  console.log(`Starting handler embedding pipeline`);
  const embedderQueue = new EmbedderQueue(sqsClient);

  console.log("Checking queue size");
  const queueSize = await embedderQueue.checkQueueSize(sqsQueueUrl!);
  if (queueSize > CROWDED_QUEUE) {
    console.log(`Backfill SQS queue has ${queueSize} messages, skipping this run to avoid overloading the queue`);
    return;
  } else {
    console.log(`Queue size has ${queueSize} messages, proceeding.`);
  }

  const randomSeed = context.awsRequestId;

  const esResults = await queryElasticSearch(BATCH_SIZE, elasticSearchUrl, imageIndexName, randomSeed);
  if (esResults.kind === 'error') {
    console.error(`Error querying ElasticSearch`, esResults);
    return;
  }

  const sqsMessages = elasticSearchResponseToSqsMessages(esResults)
  console.log(`Found ${sqsMessages.length} images to process`);
  console.debug(`3 sampled sqs messages:`, sqsMessages.slice(0, Math.min(sqsMessages.length, 3)));
  if (sqsMessages.length > 0) {
    await embedderQueue.sendSqsMessages(sqsMessages, sqsQueueUrl);
    console.log(`Sent ${sqsMessages.length} messages to SQS queue ${sqsQueueUrl}`);
  }

  console.log(`Done queuing ${sqsMessages.length} messages`);
}

const sqsClient = new SQSClient({
  region: 'eu-west-1',
});

export const handler = async (
  event: EventBridgeEvent<"Scheduled Event", {}>,
  context: Context,
): Promise<void> => {
  const ELASTIC_SEARCH_URL = process.env.ELASTIC_SEARCH_URL;
  const BACKFILL_SQS_QUEUE = process.env.BACKFILL_SQS_QUEUE;
  const IMAGE_INDEX_NAME = process.env.IMAGE_INDEX_NAME ?? 'Images_Current';

  if (!ELASTIC_SEARCH_URL) {
    throw new Error('Missing required environment variable: ELASTIC_SEARCH_URL');
  }
  if (!BACKFILL_SQS_QUEUE) {
    throw new Error('Missing required environment variable: BACKFILL_SQS_QUEUE');
  }

  return backfillOneBatch(BACKFILL_SQS_QUEUE, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME, sqsClient, context);
}
