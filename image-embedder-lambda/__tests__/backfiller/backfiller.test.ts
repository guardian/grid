import {
  GetQueueAttributesCommand,
  SendMessageBatchCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import {mockClient} from 'aws-sdk-client-mock';
import {EventBridgeEvent, Context} from 'aws-lambda';

// Mock the elasticSearch module so we can control what it returns
jest.mock('../../src/backfiller/elasticSearch');

import {queryElasticSearch} from '../../src/backfiller/elasticSearch';
import {backfillOneBatch} from "../../src/backfiller/backfiller.ts";

const ELASTIC_SEARCH_URL = 'http://localhost:9200';
const BACKFILL_SQS_QUEUE = 'https://sqs.eu-west-1.amazonaws.com/123456789/test-queue';
const IMAGE_INDEX_NAME = 'test-index';


const sqsMock = mockClient(SQSClient);
// @ts-ignore
const sqsClientMock = sqsMock as SQSClient;
const mockQueryElasticSearch = queryElasticSearch as jest.MockedFunction<
  typeof queryElasticSearch
>;


// Helper to build a minimal EventBridge event
function makeEvent(): EventBridgeEvent<'Scheduled Event', {}> {
  return {
    version: '0',
    id: 'test-event-id',
    source: 'aws.events',
    account: '123456789',
    time: '2026-01-01T00:00:00Z',
    region: 'eu-west-1',
    resources: [],
    'detail-type': 'Scheduled Event',
    detail: {},
  };
}

function makeContext(): Context {
  return {} as Context;
}

// A valid ElasticSearch hit for an image that lives at a well-formed S3 URL
function makeEsHit(
  id: string,
  fileUrl: string,
  mimeType: string = 'image/jpeg',
) {
  return {
    _id: id,
    _source: {
      source: {
        file: fileUrl,
        mimeType,
      },
    },
  };
}

beforeEach(() => {
  sqsMock.reset();
  sqsMock.on(SendMessageBatchCommand).resolves({});
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('handler – queue is too crowded', () => {
  it('skips processing when the queue size exceeds the threshold', async () => {
    // Return a queue size above the CROWDED_QUEUE threshold (20)
    sqsMock.on(GetQueueAttributesCommand).resolves({
      Attributes: {ApproximateNumberOfMessages: '21'},
    });

    await backfillOneBatch(BACKFILL_SQS_QUEUE, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME, sqsClientMock);

    expect(mockQueryElasticSearch).not.toHaveBeenCalled();
    const sendCalls = sqsMock.commandCalls(SendMessageBatchCommand);
    expect(sendCalls).toHaveLength(0);
  });

  it('proceeds when the queue size is exactly at the threshold (20)', async () => {
    sqsMock.on(GetQueueAttributesCommand).resolves({
      Attributes: {ApproximateNumberOfMessages: '20'},
    });
    mockQueryElasticSearch.mockResolvedValue({kind: 'success', hits: {hits: []}});

    await backfillOneBatch(BACKFILL_SQS_QUEUE, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME, sqsClientMock);

    expect(mockQueryElasticSearch).toHaveBeenCalledTimes(1);
  });
});

describe('handler – ElasticSearch error', () => {
  beforeEach(() => {
    sqsMock.on(GetQueueAttributesCommand).resolves({
      Attributes: {ApproximateNumberOfMessages: '0'},
    });
  });

  it('returns early without sending SQS messages when ElasticSearch returns an error', async () => {
    mockQueryElasticSearch.mockResolvedValue({
      kind: 'error',
      error: {
        root_cause: [],
        type: 'index_not_found_exception',
        reason: 'no such index',
      },
      status: 404,
    });

    await backfillOneBatch(BACKFILL_SQS_QUEUE, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME, sqsClientMock);

    const sendCalls = sqsMock.commandCalls(SendMessageBatchCommand);
    expect(sendCalls).toHaveLength(0);
  });
});

describe('handler – happy path', () => {
  beforeEach(() => {
    sqsMock.on(GetQueueAttributesCommand).resolves({
      Attributes: {ApproximateNumberOfMessages: '0'},
    });
  });

  it('sends SQS messages for images with all required fields', async () => {
    mockQueryElasticSearch.mockResolvedValue({
      kind: 'success',
      hits: {
        hits: [
          makeEsHit(
            'abc123',
            'https://my-bucket.s3.amazonaws.com/images/abc123',
          ),
          makeEsHit(
            'def456',
            'https://other-bucket.s3.amazonaws.com/path/to/def456.png',
            'image/png',
          ),
        ],
      },
    });

    await backfillOneBatch(BACKFILL_SQS_QUEUE, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME, sqsClientMock);

    const sendCalls = sqsMock.commandCalls(SendMessageBatchCommand);
    expect(sendCalls).toHaveLength(1);

    const entries = sendCalls[0].args[0].input.Entries!;
    expect(entries).toHaveLength(2);

    const first = JSON.parse(entries[0].MessageBody!);
    expect(first.imageId).toBe('abc123');
    expect(first.s3Bucket).toBe('my-bucket');
    expect(first.s3Key).toBe('images/abc123');
    expect(first.fileType).toBe('image/jpeg');

    const second = JSON.parse(entries[1].MessageBody!);
    expect(second.imageId).toBe('def456');
    expect(second.s3Bucket).toBe('other-bucket');
    expect(second.s3Key).toBe('path/to/def456.png');
    expect(second.fileType).toBe('image/png');
  });

  it('does not send any SQS messages when there are no hits', async () => {
    mockQueryElasticSearch.mockResolvedValue({
      kind: 'success',
      hits: {hits: []},
    });

    await backfillOneBatch(BACKFILL_SQS_QUEUE, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME, sqsClientMock);

    const sendCalls = sqsMock.commandCalls(SendMessageBatchCommand);
    expect(sendCalls).toHaveLength(0);
  });
});

describe('handler – message mapping (elasticSearchResponseToSqsMessages)', () => {
  beforeEach(() => {
    sqsMock.on(GetQueueAttributesCommand).resolves({
      Attributes: {ApproximateNumberOfMessages: '0'},
    });
    sqsMock.on(SendMessageBatchCommand).resolves({});
  });

  it('filters out hits missing _id', async () => {
    mockQueryElasticSearch.mockResolvedValue({
      kind: 'success',
      hits: {
        hits: [
          // missing _id
          {
            _id: '',
            _source: {
              source: {
                file: 'https://my-bucket.s3.amazonaws.com/img/a',
                mimeType: 'image/jpeg',
              },
            },
          },
          makeEsHit('good', 'https://my-bucket.s3.amazonaws.com/img/good'),
        ],
      },
    });

    await backfillOneBatch(BACKFILL_SQS_QUEUE, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME, sqsClientMock);

    const sendCalls = sqsMock.commandCalls(SendMessageBatchCommand);
    expect(sendCalls).toHaveLength(1);
    const entries = sendCalls[0].args[0].input.Entries!;
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0].MessageBody!).imageId).toBe('good');
  });

  it('filters out hits missing source.file', async () => {
    mockQueryElasticSearch.mockResolvedValue({
      kind: 'success',
      hits: {
        hits: [
          {
            _id: 'no-file',
            _source: {
              source: {
                file: '',
                mimeType: 'image/jpeg',
              },
            },
          },
          makeEsHit('good', 'https://my-bucket.s3.amazonaws.com/img/good'),
        ],
      },
    });

    await backfillOneBatch(BACKFILL_SQS_QUEUE, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME, sqsClientMock);

    const sendCalls = sqsMock.commandCalls(SendMessageBatchCommand);
    const entries = sendCalls[0].args[0].input.Entries!;
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0].MessageBody!).imageId).toBe('good');
  });

  it('filters out hits missing source.mimeType', async () => {
    mockQueryElasticSearch.mockResolvedValue({
      kind: 'success',
      hits: {
        hits: [
          {
            _id: 'no-mimetype',
            _source: {
              source: {
                file: 'https://my-bucket.s3.amazonaws.com/img/no-mime',
                mimeType: '',
              },
            },
          },
          makeEsHit('good', 'https://my-bucket.s3.amazonaws.com/img/good'),
        ],
      },
    });

    await backfillOneBatch(BACKFILL_SQS_QUEUE, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME, sqsClientMock);

    const sendCalls = sqsMock.commandCalls(SendMessageBatchCommand);
    const entries = sendCalls[0].args[0].input.Entries!;
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0].MessageBody!).imageId).toBe('good');
  });

  it('correctly parses the S3 bucket and key from a path-style URL', async () => {
    mockQueryElasticSearch.mockResolvedValue({
      kind: 'success',
      hits: {
        hits: [
          makeEsHit(
            'img1',
            'https://my-bucket.s3.amazonaws.com/folder/subfolder/img1.jpg',
          ),
        ],
      },
    });

    await backfillOneBatch(BACKFILL_SQS_QUEUE, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME, sqsClientMock);

    const sendCalls = sqsMock.commandCalls(SendMessageBatchCommand);
    const entry = JSON.parse(
      sendCalls[0].args[0].input.Entries![0].MessageBody!,
    );
    expect(entry.s3Bucket).toBe('my-bucket');
    expect(entry.s3Key).toBe('folder/subfolder/img1.jpg');
  });

  it('strips leading slash from s3Key', async () => {
    // URL.pathname always starts with '/', so we verify the handler strips it
    mockQueryElasticSearch.mockResolvedValue({
      kind: 'success',
      hits: {
        hits: [
          makeEsHit('img1', 'https://bucket.s3.amazonaws.com/a/b/c'),
        ],
      },
    });

    await backfillOneBatch(BACKFILL_SQS_QUEUE, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME, sqsClientMock);

    const sendCalls = sqsMock.commandCalls(SendMessageBatchCommand);
    const entry = JSON.parse(
      sendCalls[0].args[0].input.Entries![0].MessageBody!,
    );
    expect(entry.s3Key).toBe('a/b/c');
    expect(entry.s3Key).not.toMatch(/^\//);
  });
});

