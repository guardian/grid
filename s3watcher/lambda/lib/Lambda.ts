import {S3EventRecord} from 'aws-lambda'
import {S3} from 'aws-sdk'

export interface ImportAction {
    bucket: string
    path: string[]
    key: string
    filename: string
    size: number
}

export interface IngestConfig {
    region: string
    baseUrl: string
    apiKey: string
    failBucket: string
    s3UrlExpiry: number
    stage: string    
}

export const createActionFromNotification = function(record: S3EventRecord): ImportAction {
    const e = record.s3 

    const normaliseKey = function(key: string) {
        return decodeURIComponent(key.replace(/\+/g, " "))
    }
    const key = normaliseKey(e.object.key)
    const bucket = e.bucket.name
    const size = e.object.size

    const path =  key.split("/")
    const filename = path[(path.length - 1)]

    return {
        bucket,
        path,
        key,
        filename,
        size
    }
}

export const parseIngestConfig = async function(json: string): Promise<IngestConfig> {
    try {
        return JSON.parse(json)
    } catch (e) {
        return Promise.reject(new Error("s3://${s3Event.bucket}/config.json is invalid JSON"))
    }
}

export const readIngestConfig = async function(s3Client: S3, event: ImportAction): Promise<string> {
    const response = await s3Client.getObject({
        Bucket: event.bucket,
        Key: "config.json"
    }).promise()
    const data = response.Body?.toString()  
    if ( data === undefined) {
        return Promise.reject(new Error(`Error reading config from s3://${event.bucket}/config.json`))
    } else {
        return data
    }
}
