package com.gu.mediaservice

import scala.concurrent.ExecutionContext.Implicits.global

class BatchIndexLambdaHandler {

  private val batchIndex = BatchIndexHandler(
    apiKey = sys.env("API_KEY"),
    domainRoot = sys.env("DOMAIN_ROOT"),
    batchIndexBucket = sys.env("BATCH_INDEX_BUCKET"),
    kinesisStreamName = sys.env("KINESIS_STREAM")
  )

  def handle(mediaIds: List[String]) = {
    batchIndex.processImages(mediaIds)
  }

}
