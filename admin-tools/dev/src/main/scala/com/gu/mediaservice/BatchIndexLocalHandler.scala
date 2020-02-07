package com.gu.mediaservice

import scala.concurrent.ExecutionContext.Implicits.global

object BatchIndexLocalHandler extends App {

  private val cfg = BatchIndexHandlerConfig(
    apiKey = "dev-",
    domainRoot = "local.dev-gutools.co.uk",
    batchIndexBucket = "media-service-admin-tools-dev",
    kinesisStreamName = "media-service-DEV-ThrallMessageQueue-1N0T2UXYNUIC9",
    dynamoTableName = "grid-images-to-reingest-DEV",
    batchSize = 3,
    kinesisEndpoint = Some("http://localhost:4568")
  )

  private val batchIndex = BatchIndexHandler(cfg)

  batchIndex.processImages()

}
