package com.gu.mediaservice

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import scala.concurrent.ExecutionContext.Implicits.global

object BatchIndexLocalHandler extends App {

  lazy val awsCredentials = new ProfileCredentialsProvider("media-service")

  private val cfg = BatchIndexHandlerConfig(
    apiKey = "dev-",
    domainRoot = "local.dev-gutools.co.uk",
    batchIndexBucket = "media-service-admin-tools-dev",
    kinesisStreamName = "media-service-DEV-ThrallMessageQueue-1N0T2UXYNUIC9",
    dynamoTableName = "grid-images-to-reingest-DEV",
    batchSize = 1,
    kinesisEndpoint = Some("http://localhost:4568"),
    awsCreds = Some(awsCredentials)
  )

  private val batchIndex = BatchIndexHandler(cfg)

  batchIndex.processImages()

}
