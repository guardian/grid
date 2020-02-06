package com.gu.mediaservice

import com.gu.mediaservice.BatchIndexLocalHandler.awsCredentials

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
    val mediaIds = List("9940e402a11f2caa00777f334f5d3999af4cb679", "5220eb766f0c9527ac54808d57edc7a9a027df84")
    batchIndex.processImages(mediaIds)
  }

}
