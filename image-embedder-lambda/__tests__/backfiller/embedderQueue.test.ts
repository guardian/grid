import {
	GetQueueAttributesCommand,
	SendMessageBatchCommand,
	SQSClient,
} from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import { EmbedderQueue } from '../../src/backfiller/embedderQueue';
import { SQSMessageBody } from '../../src/shared/sqsMessageBody';

const sqsMock = mockClient(SQSClient);
const client = new SQSClient({});
const embedderQueue = new EmbedderQueue(client);

const QUEUE_URL = 'https://sqs.eu-west-1.amazonaws.com/123456789/test-queue';

function makeMessage(i: number): SQSMessageBody {
	return {
		imageId: `image-${i}`,
		s3Bucket: 'my-bucket',
		s3Key: `images/image-${i}`,
		fileType: 'image/jpeg',
	};
}

beforeEach(() => {
	sqsMock.reset();
});

describe('EmbedderQueue.checkQueueSize', () => {
	it('returns the approximate number of messages when set', async () => {
		sqsMock.on(GetQueueAttributesCommand).resolves({
			Attributes: { ApproximateNumberOfMessages: '42' },
		});

		const size = await embedderQueue.checkQueueSize(QUEUE_URL);

		expect(size).toBe(42);
	});

	it('returns 0 when the attribute is absent', async () => {
		sqsMock.on(GetQueueAttributesCommand).resolves({ Attributes: {} });

		const size = await embedderQueue.checkQueueSize(QUEUE_URL);

		expect(size).toBe(0);
	});
});

describe('EmbedderQueue.sendSqsMessages', () => {
	beforeEach(() => {
		sqsMock.on(SendMessageBatchCommand).resolves({});
	});

	it('serialises each message body as JSON', async () => {
		const messages = [makeMessage(1)];

		await embedderQueue.sendSqsMessages(messages, QUEUE_URL);

		const calls = sqsMock.commandCalls(SendMessageBatchCommand);
		const entry = calls[0].args[0].input.Entries![0];
		expect(JSON.parse(entry.MessageBody!)).toEqual(messages[0]);
	});

	it('sends a single batch when there are fewer than 10 messages', async () => {
		const messages = [makeMessage(1), makeMessage(2), makeMessage(3)];

		await embedderQueue.sendSqsMessages(messages, QUEUE_URL);

		const calls = sqsMock.commandCalls(SendMessageBatchCommand);
		expect(calls).toHaveLength(1);
		expect(calls[0].args[0].input.QueueUrl).toBe(QUEUE_URL);
		expect(calls[0].args[0].input.Entries).toHaveLength(3);
	});

	it('sends exactly ceil(n/10) batches for n messages', async () => {
		// 25 messages → 3 batches (10, 10, 5)
		const messages = Array.from({ length: 25 }, (_, i) => makeMessage(i));

		await embedderQueue.sendSqsMessages(messages, QUEUE_URL);

		const calls = sqsMock.commandCalls(SendMessageBatchCommand);
		expect(calls).toHaveLength(3);
		expect(calls[0].args[0].input.Entries).toHaveLength(10);
		expect(calls[1].args[0].input.Entries).toHaveLength(10);
		expect(calls[2].args[0].input.Entries).toHaveLength(5);
	});

	it('sends no batches when there are no messages', async () => {
		await embedderQueue.sendSqsMessages([], QUEUE_URL);

		const calls = sqsMock.commandCalls(SendMessageBatchCommand);
		expect(calls).toHaveLength(0);
	});
});
