import {createMetric} from './Metrics'
import { buildGridImportRequest, importImage } from './GridApi'
import { CleanEvent, IngestConfig } from './Lambda'
import {S3, CloudWatch} from 'aws-sdk'

export const transfer = async function(s3: S3, cloudwatch: CloudWatch, event: CleanEvent, config: IngestConfig): Promise<void> {
    const s3ObjectRequest = {
        Bucket: event.bucket,
        Key: event.key
    };

    const importRequest = buildGridImportRequest(config, event)

    console.log('Importing via image-loader.', s3ObjectRequest)

    const urlExpiryInSeconds = config.s3UrlExpiry;
    const signedUrl = await s3.getSignedUrlPromise('getObject', {
        ... s3ObjectRequest,
        Expires: urlExpiryInSeconds
    })

    const uploadResult = await importImage(importRequest, signedUrl)
    console.log('Grid API call finished', uploadResult)
    
    // record the cloudwatch result either way
    console.log('Recording result to Cloud Watch', uploadResult)
    await cloudwatch.putMetricData(
        createMetric(uploadResult)
    ).promise().catch(err => {
        console.log('Error whilst recording cloudwatch metrics', err)
    })

    if (uploadResult.succeeded) {
        console.log('Deleting from ingest bucket.', s3ObjectRequest)
        await s3.deleteObject(s3ObjectRequest).promise().catch(err => {
            console.log('Error whilst deleting ingested image', err)
        })
    } else {
        const s3CopyToDeadLetterReq = {
            CopySource: event.bucket + "/" + event.key,
            Bucket: config.failBucket,
            Key: event.key
        }

        try {
            console.log('Import failed.', uploadResult)
            console.log('Copying to fail bucket.')
            await s3.copyObject(s3CopyToDeadLetterReq).promise()
            console.log('Deleting from ingest bucket.', s3ObjectRequest)
            await s3.deleteObject(s3ObjectRequest).promise().catch(err => {
                console.log('Error whilst deleting failed ingested image', err)
            })
        } catch(err) {
            console.log('Error whilst moving image to failed bucket', err)
        }

        throw new Error(`Unable to import file: s3://${event.bucket}/${event.key}`)
    }

}
