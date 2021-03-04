package com.gu.mediaservice

import com.gu.mediaservice.indexing.IndexInputCreation
import play.api.libs.ws.ahc.AhcWSClient
import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import play.api.libs.ws._

class BatchIndexLambdaHandler {


  implicit private val system: ActorSystem = ActorSystem()
  implicit private val materializer: ActorMaterializer = ActorMaterializer()
  implicit private val ws:WSClient  = AhcWSClient()

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
    checkerStartState = IndexInputCreation.get(sys.env("CHECKER_START_STATE").toInt),
    domainRoot = sys.env("DOMAIN_ROOT"),
  )

  private val batchIndex = new BatchIndexHandler(cfg)


  def handleRequest(): Unit = {
    batchIndex.processImages()
  }

  def handleCheckRequest(): Unit = {
    batchIndex.checkImages()
  }

}
