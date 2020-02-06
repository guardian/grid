package com.gu.mediaservice

import scala.concurrent.ExecutionContext.Implicits.global

class BatchIndexLambdaHandler {

  private val cfg = BatchIndexHandlerConfig(
    apiKey = sys.env("API_KEY"),
    domainRoot = sys.env("DOMAIN_ROOT"),
    batchIndexBucket = sys.env("BATCH_INDEX_BUCKET"),
    kinesisStreamName = sys.env("KINESIS_STREAM"),
    dynamoTableName = sys.env("IMAGES_TO_INDEX_DYNAMO_TABLE"),
    batchSize = sys.env("BATCH_SIZE").toInt
  )

  private val batchIndex = BatchIndexHandler(cfg)

  def handleRequest() = {
    batchIndex.processImages()
  }

}
