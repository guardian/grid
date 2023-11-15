/* eslint-disable no-console */
import AWS from "aws-sdk"
import { readConfig } from "../lambda/lib/EnvironmentConfig"

import { exit } from "process"

const envConfig = readConfig()

const awsConfig = envConfig.isDev
  ? {
      accessKeyId: "test",
      secretAccessKey: "test",
      region: envConfig.region,
      endpoint: "http://localhost:4566",
      s3ForcePathStyle: true,
    }
  : undefined

AWS.config.update({
  region: envConfig.region,
})

const s3 = new AWS.S3(awsConfig)

const findBucketName = async () => {
  const result = await s3.listBuckets().promise()
  const ingestBucket = result.Buckets?.find(bucket => bucket.Name?.includes('s3watcheringestbucket'))
  return ingestBucket?.Name
}

const listObjects = async (bucketName?:string) => {
  console.log({bucketName})
  if (!bucketName) {
    return
  }
  const result = await s3.listObjects({
    Bucket:bucketName
  }).promise()
  console.table(result.Contents, ['Key', 'Size','LastModified'])
}


findBucketName()
.then(listObjects)
.then(() => {
  exit()
})
