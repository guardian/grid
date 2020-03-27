package com.gu.mediaservice

import com.gu.mediaservice.indexing.IndexInputCreation

class BatchIndexLambdaHandler {

  private val cfg = BatchIndexHandlerConfig(
    apiKey = sys.env("API_KEY"),
    projectionEndpoint = sys.env("PROJECTION_ENDPOINT"),
    imagesEndpoint = sys.env("IMAGES_ENDPOINT"),
    batchIndexBucket = sys.env("BATCH_INDEX_BUCKET"),
    kinesisStreamName = sys.env("KINESIS_STREAM"),
    dynamoTableName = sys.env("IMAGES_TO_INDEX_DYNAMO_TABLE"),
    batchSize = sys.env("BATCH_SIZE").toInt,
    maxIdleConnections = sys.env("MAX_IDLE_CONNECTIONS").toInt,
    stage = sys.env.get("STAGE"),
    threshold = sys.env.get("LATENCY_THRESHOLD").map(t => Integer.parseInt(t)),
    maxSize = sys.env("MAX_SIZE").toInt,
    startState = IndexInputCreation.get(sys.env("START_STATE").toInt),
    checkerStartState = IndexInputCreation.get(sys.env("CHECKER_START_STATE").toInt)
  )

  private val batchIndex = new BatchIndexHandler(cfg)


  def handleRequest() = {
    batchIndex.processImages()
  }

  def handleCheckRequest() = {
    batchIndex.checkImages()
  }

}
