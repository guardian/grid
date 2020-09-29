import {cleanEvents, CleanEvent, IngestConfig, readIngestConfig} from './lib/Lambda'
import {transfer} from './lib/Transfer'
import AWS from 'aws-sdk'
import { readConfig } from './lib/EnvironmentConfig'

import { S3Event } from "aws-lambda"

const envConfig = readConfig()

if (envConfig.isDev) {
    AWS.config.update({
        credentials: new AWS.SharedIniFileCredentials({profile: 'media-service'}),
        region: 'eu-west-1'
    })
}

const s3 = new AWS.S3()
const cloudwatch = new AWS.CloudWatch()

const processEvent = async function(event:CleanEvent) {
    const ingestConfig: IngestConfig = await readIngestConfig(s3, event)
    await transfer(s3, cloudwatch, event, ingestConfig)
}

interface Failure {
    error: any // eslint-disable-line @typescript-eslint/no-explicit-any
    event: CleanEvent
}
function isFailure(item: Failure | void): item is Failure {
    return item !== undefined
}

exports.handler = async function(rawEvent: S3Event) {
    console.log('ELKKinesisLogger started')

    const events: CleanEvent[] = cleanEvents(rawEvent)

    const results = await Promise.all(events.map(e => processEvent(e).catch(error=>{
        return <Failure>{ error, event: e }
    })))

    const failures = results.filter(isFailure)

    failures.forEach(failure => {
        console.log('Failed to process event', failure.event, failure.error)
    })
}
