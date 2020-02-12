package com.gu.mediaservice

class BatchIndexLambdaHandler {

  private val cfg = BatchIndexHandlerConfig(
    apiKey = sys.env("API_KEY"),
    projectionEndpoint = sys.env("PROJECTION_ENDPOINT"),
    batchIndexBucket = sys.env("BATCH_INDEX_BUCKET"),
    kinesisStreamName = sys.env("KINESIS_STREAM"),
    dynamoTableName = sys.env("IMAGES_TO_INDEX_DYNAMO_TABLE"),
    batchSize = sys.env("BATCH_SIZE").toInt,
    maxIdleConnections = sys.env("MAX_IDLE_CONNECTIONS").toInt
  )

  private val batchIndex = new BatchIndexHandler(cfg)

  def handleRequest() = {
    batchIndex.processImages()
  }

}
