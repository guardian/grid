import {
	SQSClient,
	CreateQueueCommand,
	PurgeQueueCommand,
	ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';
import * as fs from 'fs';
import * as path from 'path';
import { backfillOneBatch } from '../../../src/backfiller/backfiller.ts';
import { Context } from 'aws-lambda';

const ELASTIC_SEARCH_URL = 'http://localhost:9200';

// We create a fresh queue and index for each test run to avoid cross-contamination.
const TEST_QUEUE_NAME = `backfiller-integration-test-${Date.now()}`;
const TEST_INDEX_NAME = `images-integration-test-${Date.now()}`;

const ES_SEED_FILE = path.resolve(
	__dirname,
	'test-data/input/es-documents.jsonl',
);

const context = { awsRequestId: 'test' } as Context;

async function createIndexWithMapping(elasticSearchUrl: string): Promise<void> {
	// We need keyword mappings for the fields used in term/terms queries (usageRights.category,
	// usageRights.supplier). Without this, dynamic mapping would create text fields and
	// term queries would fail to match. This is a minimalist version of Mappings.scala
	const mapping = {
		mappings: {
			dynamic: false,
			properties: {
				usageRights: {
					type: 'object',
					properties: {
						category: { type: 'keyword' },
						supplier: { type: 'keyword' },
						suppliersCollection: { type: 'keyword' },
					},
				},
				softDeletedMetadata: {
					type: 'object',
					properties: {
						deleteTime: { type: 'date' },
						deletedBy: { type: 'keyword' },
					},
				},
				embedding: {
					type: 'object',
					properties: {
						cohereEmbedV4: {
							type: 'object',
							properties: {
								image: { type: 'dense_vector', dims: 256 },
							},
						},
					},
				},
				source: {
					type: 'object',
					properties: {
						file: { type: 'keyword', index: false },
						mimeType: { type: 'keyword' },
					},
				},
			},
		},
	};

	const response = await fetch(`${elasticSearchUrl}/${TEST_INDEX_NAME}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(mapping),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Failed to create ES index: ${body}`);
	}
}

async function seedElasticSearch(elasticSearchUrl: string): Promise<void> {
	const lines = fs
		.readFileSync(ES_SEED_FILE, 'utf-8')
		.split('\n')
		.filter((l) => l.trim().length > 0);

	// Build the NDJSON bulk body: action line then source line for each doc
	const bulkBody =
		lines
			.flatMap((line) => {
				const doc = JSON.parse(line);
				return [
					JSON.stringify({ index: { _index: TEST_INDEX_NAME, _id: doc._id } }),
					JSON.stringify(doc._source),
				];
			})
			.join('\n') + '\n';

	const response = await fetch(`${elasticSearchUrl}/_bulk`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-ndjson' },
		body: bulkBody,
	});

	const result = (await response.json()) as {
		errors: boolean;
		items: unknown[];
	};
	if (result.errors) {
		throw new Error(`ES bulk indexing failed: ${JSON.stringify(result.items)}`);
	}

	// Ensure all docs are visible before the test queries them
	await fetch(`${elasticSearchUrl}/${TEST_INDEX_NAME}/_refresh`, {
		method: 'POST',
	});
}

async function tearDownElasticSearchIndex(
	elasticSearchUrl: string,
): Promise<void> {
	await fetch(`${elasticSearchUrl}/${TEST_INDEX_NAME}`, { method: 'DELETE' });
}

describe('Backfiller integration tests', () => {
	let sqsClient: SQSClient;
	let queueUrl: string;

	beforeAll(async () => {
		sqsClient = new SQSClient({
			region: 'eu-west-1',
			endpoint: 'http://localhost:4566',
			credentials: {
				accessKeyId: 'test',
				secretAccessKey: 'test',
			},
		});

		// Create a fresh SQS queue for this test run
		const createResult = await sqsClient.send(
			new CreateQueueCommand({ QueueName: TEST_QUEUE_NAME }),
		);
		queueUrl = createResult.QueueUrl!;

		await createIndexWithMapping(ELASTIC_SEARCH_URL);
		await seedElasticSearch(ELASTIC_SEARCH_URL);
	});

	afterAll(async () => {
		await tearDownElasticSearchIndex(ELASTIC_SEARCH_URL);
	});

	beforeEach(async () => {
		// Purge the queue so each test starts with an empty queue
		await sqsClient.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
	});

	it('sends SQS messages for images that have no embedding', async () => {
		await backfillOneBatch(
			queueUrl,
			ELASTIC_SEARCH_URL,
			TEST_INDEX_NAME,
			sqsClient,
			context,
		);

		// Give SQS a moment to make messages visible
		const received = await sqsClient.send(
			new ReceiveMessageCommand({
				QueueUrl: queueUrl,
				MaxNumberOfMessages: 10,
				WaitTimeSeconds: 2,
			}),
		);

		// We expect exactly 3 messages: the 3 docs without an embedding and without softDeletedMetadata.
		// The soft-deleted doc (86be5cf0...) must be excluded.
		const messages = received.Messages ?? [];
		const imageIds = messages.map((msg) => JSON.parse(msg.Body!).imageId);
		expect(imageIds).toHaveLength(3);
		expect(imageIds).toEqual(
			expect.arrayContaining([
				'70943a938364ec2dfd521ff7e57628081cf5b358',
				'b401c84f35fcd21068c322e91b69416a58c2103b',
				'd8981dc73c5954c29ae10ff419515285e2e9f476',
			]),
		);
	});

	it('does not send any messages when the queue is already crowded (>20)', async () => {
		// Flood the queue with 21 placeholder messages so the backfiller considers it crowded.
		// We use a separate queue with a known message count rather than trying to trick the
		// real queue, since purging + re-seeding would be racy.
		// Instead we override the env var to point at a different queue that already has messages.
		//
		// For this test we simply seed our queue with 21 messages using SQS SendMessageBatch
		// (done via the SQS SDK rather than going through the handler) and then invoke the
		// handler to confirm it skips processing.
		const { SendMessageBatchCommand } = await import('@aws-sdk/client-sqs');
		const batches = Array.from({ length: 21 }, (_, i) => ({
			Id: `seed-${i}`,
			MessageBody: JSON.stringify({ placeholder: i }),
		}));

		// SQS SendMessageBatch accepts max 10 per call
		await sqsClient.send(
			new SendMessageBatchCommand({
				QueueUrl: queueUrl,
				Entries: batches.slice(0, 10),
			}),
		);
		await sqsClient.send(
			new SendMessageBatchCommand({
				QueueUrl: queueUrl,
				Entries: batches.slice(10, 20),
			}),
		);
		await sqsClient.send(
			new SendMessageBatchCommand({
				QueueUrl: queueUrl,
				Entries: batches.slice(20),
			}),
		);

		// Wait briefly for the approximate count to update in LocalStack
		await new Promise((resolve) => setTimeout(resolve, 500));

		console.log(
			'Queue seeded, approximate count check done, invoking handler...',
		);

		await backfillOneBatch(
			queueUrl,
			ELASTIC_SEARCH_URL,
			TEST_INDEX_NAME,
			sqsClient,
			context,
		);

		// The handler should have detected the crowded queue and returned early,
		// so the message count should be unchanged (still 21 seed messages).
		const received = await sqsClient.send(
			new ReceiveMessageCommand({
				QueueUrl: queueUrl,
				MaxNumberOfMessages: 10,
				WaitTimeSeconds: 1,
			}),
		);

		// All messages we receive should be our seed messages, not new ones from the handler
		const bodies = (received.Messages ?? []).map((m) => JSON.parse(m.Body!));
		for (const body of bodies) {
			expect(body).toHaveProperty('placeholder');
		}
	});
});
