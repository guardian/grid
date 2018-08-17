package com.gu.thrall

import java.util.concurrent.TimeUnit

import com.amazonaws.services.lambda.runtime.events.SNSEvent
import com.amazonaws.services.lambda.runtime.{Context, RequestHandler}
import com.gu.mediaservice.lib.ImageIngestOperations
import com.gu.thrall.clients.{DynamoNotifications, ElasticSearch}
import com.gu.thrall.config.{Sns, ThrallLambdaConfig}
import com.typesafe.scalalogging.StrictLogging
import scala.collection.JavaConverters._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.Duration
import scala.concurrent.{Await, Future}

class Lambda extends RequestHandler[SNSEvent, Unit] with StrictLogging {

  private val host = getEnvOrElse("HOST", "localhost")
  private val port = Integer.parseInt(getEnvOrElse("PORT", "9200"))
  private val protocol = getEnvOrElse("PROTOCOL", "http")
  private val esActionsFlag = getEnvOrElse("ES_ACTIONS_FLAG", "False").equalsIgnoreCase("true")
  private val s3ActionsFlag = getEnvOrElse("S3_ACTIONS_FLAG", "False").equalsIgnoreCase("true")
  private val dynamoActionsFlag = getEnvOrElse("DYNAMO_ACTIONS_FLAG", "False").equalsIgnoreCase("true")
  private val indexName = getEnvOrElse("INDEX_NAME", "writeIndex")
  private val imageBucket = getEnvOrElse("IMAGE_BUCKET", "NONE")
  private val thumbnailBucket = getEnvOrElse("THUMBNAIL_BUCKET", "NONE")
  private val dynamoTopicArn = getEnvOrElse("DYNAMO_TOPIC_ARN", "NONE")

  private val elasticSearch = new ElasticSearch(host, port, protocol, indexName)

  val config = new ThrallLambdaConfig()
  val s3Store = new ImageIngestOperations(imageBucket, thumbnailBucket, config)
  val dynamoNotifications = new DynamoNotifications(config, dynamoTopicArn)

  private val consumer = new Consumer(elasticSearch, s3Store, dynamoNotifications, esActionsFlag, s3ActionsFlag, dynamoActionsFlag)

  override def handleRequest(input: SNSEvent, context: Context): Unit = {
    Await.result(
      Future.traverse(input.getRecords.asScala)(
        record =>{
          logger.debug(s"Starting processing of ${record.getSNS.getSubject}:\n${record.getSNS.getMessage}")
          for {
            invokingEvent <- JsonParsing.imageDetails(record.getSNS.getMessage)
            result <- consumer.process(Sns(record.getSNS.getSubject, invokingEvent))
          } yield result
        }
      ),
      Duration(60, TimeUnit.SECONDS)
    ) collect {
      case Right(success) => logger.info(success)
      case Left(failure) => logger.error(failure)
    }
  }

  private def getEnvOrElse(key: String, default: String): String = Option(System.getenv(key)) match {
    case Some(value) => value.trim
    case None => {
      logger.info(s"No value for key '$key' found; using default value '$default'")
      default
    }
  }
}
