package com.gu.mediaservice

object BatchIndexLocalHandler extends App {

  private val cfg = BatchIndexHandlerConfig(
    apiKey = sys.env("API_KEY"),
    projectionEndpoint = sys.env("PROJECTION_ENDPOINT"),
    batchIndexBucket = sys.env("BATCH_INDEX_BUCKET"),
    kinesisStreamName = sys.env("KINESIS_STREAM"),
    dynamoTableName = sys.env("IMAGES_TO_INDEX_DYNAMO_TABLE"),
    batchSize = 3,
    kinesisEndpoint = Some("http://localhost:4568"),
    maxIdleConnections = 5,
  )

  private val batchIndex = new BatchIndexHandler(cfg)

  batchIndex.processImages()

}
