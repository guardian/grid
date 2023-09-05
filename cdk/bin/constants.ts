export const AWS_REGION = 'eu-west-1';
export const STACK = 'media-service';
export const REAPER_APP_NAME = 'grid-reaper';
export const ENV_VAR_BATCH_SIZE = 'BATCH_SIZE';

export const buildRecordsBucketName = (stage: string): string =>
	`${REAPER_APP_NAME}-records-${stage}`.toLowerCase();
