package com.gu.mediaservice

import scala.concurrent.ExecutionContext.Implicits.global

object BatchIndexLocalHandler extends App {

  private val cfg = BatchIndexHandlerConfig(
    apiKey = sys.env("API_KEY"),
    domainRoot = sys.env("DOMAIN_ROOT"),
    batchIndexBucket = sys.env("BATCH_INDEX_BUCKET"),
    kinesisStreamName = sys.env("KINESIS_STREAM"),
    dynamoTableName = sys.env("IMAGES_TO_INDEX_DYNAMO_TABLE"),
    batchSize = 3,
    kinesisEndpoint = Some("http://localhost:4568")
  )

  private val batchIndex = BatchIndexHandler(cfg)

  batchIndex.processImages()

}
