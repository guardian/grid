import { S3Event, S3EventRecord } from 'aws-lambda';
import fetch from 'node-fetch';

import { logger } from './logging';
import { s3, cloudwatch } from './aws';
import config from './config';

interface FileInBucket {
    uploadedBy: string,
    filename: string
}

async function retry<T>(maxTimes: number, fn: () => Promise<T>): Promise<T> {
    let lastFailure: Error | undefined = undefined;

    for(let i = 0; i < maxTimes; i++) {
        try {
            return await fn();
        } catch(e) {
            lastFailure = e;
        }
    }

    return Promise.reject(lastFailure);
}

function getSignedURL(event: S3EventRecord): string {
    return s3.getSignedUrl('getObject', {
        Bucket: event.s3.bucket.name,
        Key: event.s3.object.key,
        Expires: 60
    });
}

function parseKey(key: string): FileInBucket {
    const parts = key.split("/");
    if(parts.length > 2) {
        return { uploadedBy: parts[0], filename: parts[1] };
    }

    throw new Error(`Unable to parse key ${key}`);
}

async function sendResultToCloudwatch(metricName: string, uploadedBy: string, stage: string) {
    const timestamp = new Date();

    return cloudwatch.putMetricData({
        Namespace: `${stage}/S3watcher`,
        MetricData: [
            {
                MetricName: metricName,
                Timestamp: timestamp,
                Unit: "Count",
                Value: 1,
                Dimensions: [
                    {
                        "Name": "UploadedBy",
                        "Value": uploadedBy
                    }
                ]
            },
            {
                MetricName: metricName,
                Timestamp: timestamp,
                Unit: "Count",
                Value: 1
            },
        ]
    }).promise();
}

async function uploadFile(event: S3EventRecord): Promise<void> {
    const { uploadedBy, filename } = parseKey(event.s3.object.key);
    logger.log('Importing via image-loader.', { Bucket: event.s3.bucket.name, Key: event.s3.object.key });

    const params = new URLSearchParams();
    params.append("uri", getSignedURL(event));
    params.append("uploadedBy", uploadedBy);
    params.append("filename", filename);
    params.append("stage", config.stage);

    const options = {
        headers: { 'X-Gu-Media-Key': config.apiKey }
    };

    const url = `${config.importUrl}?${params.toString()}`;
    const response = await fetch(url, options);

    if(response.status != 202) {
        return Promise.reject(`Error ingesting ${url}: ${response.status} - ${response.statusText}`);
    } else {
        return Promise.resolve();
    }
}

async function handleFile(event: S3EventRecord): Promise<void> {
    const bucket = event.s3.bucket.name;
    const key = event.s3.object.key;

    const copySource = `/${bucket}/${key}`;
    const { uploadedBy } = parseKey(event.s3.object.key);

    try {
        await retry(5, () => uploadFile(event));
        await sendResultToCloudwatch("UploadedImages", uploadedBy, config.stage);
    } catch(e) {
        logger.log('Import failed', e);
        logger.log('Copying to fail bucket')

        await s3.copyObject({ Bucket: config.failBucket, Key: key, CopySource: copySource });
        await sendResultToCloudwatch("FailedUploads", uploadedBy, config.stage);
    } finally {
        logger.log('Deleting from ingest bucket')
        await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
    }
}

export async function handleFiles(event: S3Event): Promise<void> {    
    logger.log('ELKKinesisLogger started');

    for(const record of event.Records) {
        await handleFile(record);
    }
}