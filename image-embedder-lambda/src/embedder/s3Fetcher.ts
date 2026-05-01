import {
	GetObjectCommand,
	GetObjectCommandOutput,
	GetObjectRequest,
	S3Client,
} from '@aws-sdk/client-s3';

export class S3Fetcher {
	s3Client: S3Client;
	constructor(s3Client: S3Client) {
		this.s3Client = s3Client;
	}

	async fetch(
		s3Bucket: string,
		s3Key: string,
	): Promise<Uint8Array | undefined> {
		const input: GetObjectRequest = {
			Bucket: s3Bucket,
			Key: s3Key,
		};

		const logSuffix = `(bucket = ${s3Bucket}, key = ${s3Key})`;
		console.log(`Fetching image from S3 ${logSuffix}`);
		try {
			const command = new GetObjectCommand(input);
			const response: GetObjectCommandOutput =
				await this.s3Client.send(command);

			if (!response.Body) {
				console.warn(`No body in S3 response ${logSuffix}`);
				return undefined;
			}

			const bytes = await response.Body.transformToByteArray();
			console.log(
				`Fetched image: ${bytes.length.toLocaleString()} bytes ${logSuffix}`,
			);
			return bytes;
		} catch (error) {
			if (error instanceof Error && error.name === 'NoSuchKey') {
				console.log(`No object found in S3 ${logSuffix}`);
			} else {
				console.error(`Failed to fetch from S3 ${logSuffix}: `, error);
			}
			return undefined;
		}
	}
}
