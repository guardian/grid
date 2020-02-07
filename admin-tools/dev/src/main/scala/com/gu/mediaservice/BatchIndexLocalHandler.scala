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

  // ids that exists on your local grid
  val mediaIds = List(
    "011db3facffd4ef3d3e07eabbd3c07bb41cbf819",
    "011a95f670b71e4dd223f4b8eda5bfb41235ca7e",
    "066d163d11dfdc8223fb9a15fbf5265f0e47655b",
    "d23c0faaed970d9769e67d7ed4eefbbb35b6fccc",
    "d23c0e19cdc10a7573d4c712313a105863e998c3",
    "non-existent"
  )

  batchIndex.processImages()

}
