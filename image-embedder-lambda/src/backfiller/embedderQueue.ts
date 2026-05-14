import {
	GetQueueAttributesCommand,
	SendMessageBatchCommand,
	SQSClient,
} from '@aws-sdk/client-sqs';
import { SQSMessageBody } from '../shared/sqsMessageBody';

export class EmbedderQueue {
	sqsClient: SQSClient;

	constructor(sqsClient: SQSClient) {
		this.sqsClient = sqsClient;
	}

	async sendSqsMessages(
		messages: SQSMessageBody[],
		sqsQueue: string,
	): Promise<void> {
		// chunk the in put by groups of 10
		const chunkSize = 10;
		for (let i = 0; i < messages.length; i += chunkSize) {
			const chunk = messages.slice(i, i + chunkSize);
			const entries = chunk.map((message, index) => ({
				Id: `${message.imageId}-${index}`,
				MessageBody: JSON.stringify(message),
			}));
			await this.sqsClient.send(
				new SendMessageBatchCommand({
					QueueUrl: sqsQueue,
					Entries: entries,
				}),
			);
		}
	}

	async checkQueueSize(sqsQueue: string): Promise<number> {
		const queueSizeCommand = new GetQueueAttributesCommand({
			QueueUrl: sqsQueue,
			AttributeNames: ['ApproximateNumberOfMessages'],
		});
		const response = await this.sqsClient.send(queueSizeCommand);
		const queueSize = response.Attributes?.ApproximateNumberOfMessages;
		return queueSize ? parseInt(queueSize) : 0;
	}
}
