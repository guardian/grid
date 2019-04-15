package com.gu.mediaservice.lib.aws

import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

import _root_.play.api.libs.functional.syntax._
import _root_.play.api.libs.json._
import akka.actor.ActorSystem
import com.amazonaws.services.cloudwatch.model.Dimension
import com.amazonaws.services.sqs.model.{DeleteMessageRequest, ReceiveMessageRequest, Message => SQSMessage}
import com.amazonaws.services.sqs.{AmazonSQS, AmazonSQSClientBuilder}
import com.gu.mediaservice.lib.ImageId
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.json.PlayJsonHelpers._
import com.gu.mediaservice.lib.metrics.Metric
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import play.api.Logger

import scala.annotation.tailrec
import scala.collection.JavaConverters._
import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future}

abstract class MessageConsumer(queueUrl: String, awsEndpoint: String, config: CommonConfig, metric: Metric[Long]) extends ImageId {
  val actorSystem = ActorSystem("MessageConsumer")

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def startSchedule(): Unit =
    actorSystem.scheduler.scheduleOnce(0.seconds)(processMessages())

  lazy val client: AmazonSQS = config.withAWSCredentials(AmazonSQSClientBuilder.standard()).build()

  def chooseProcessor(subject: String): Option[JsValue => Future[Any]]

  val timeMessageLastProcessed = new AtomicReference[DateTime](DateTime.now)

  @tailrec
  final def processMessages(): Unit = {
    // Pull 1 message at a time to avoid starvation
    // Wait for maximum duration (20s) as per doc recommendation:
    // http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-long-polling.html
    for (msg <- getMessages(waitTime = 20, maxMessages = 1)) {

      val result = extractSNSMessage(msg).map { message =>
        message.subject.flatMap(chooseProcessor) match {
          case Some(processor) =>
            processor.apply(message.body)
            recordMessageCount(message)
            timeMessageLastProcessed.lazySet(DateTime.now)
          case None =>
            Logger.error(s"Unrecognised message subject ${message.subject}")
        }
      }

      result.fold(
        err => Logger.error(
          err.map { case (path, errors) =>
            s"Validation errors at $path: [${errors.map(_.message).mkString(", ")}]"
          }.mkString("\n")
        ),
        _ => deleteMessage(msg)
      )
    }

    processMessages()
  }

  private def recordMessageCount(message: SNSMessage): Unit = {
    val dimensions = message.subject match {
      case Some(subject) => List(new Dimension().withName("subject").withValue(subject))
      case None => List()
    }
    metric.runRecordOne(1L, dimensions)
  }

  private def getMessages(waitTime: Int, maxMessages: Int): Seq[SQSMessage] =
    client.receiveMessage(
      new ReceiveMessageRequest(queueUrl)
        .withWaitTimeSeconds(waitTime)
        .withMaxNumberOfMessages(maxMessages)
    ).getMessages.asScala.toList

  private def extractSNSMessage(sqsMessage: SQSMessage): Either[Seq[(JsPath, Seq[JsonValidationError])], SNSMessage] =
    logParseErrors(Json.fromJson[SNSMessage](Json.parse(sqsMessage.getBody)))

  private def deleteMessage(message: SQSMessage): Unit =
    client.deleteMessage(new DeleteMessageRequest(queueUrl, message.getReceiptHandle))
}

// TODO: improve and use this (for logging especially) else where.
case class EsResponse(message: String)
case class SNSBodyParseError(message: String) extends Exception

case class SNSMessage(
  messageType: String,
  messageId: String,
  topicArn: String,
  subject: Option[String],
  timestamp: DateTime,
  body: JsValue
)

object SNSMessage {
  private def parseTimestamp(timestamp: String): DateTime =
    ISODateTimeFormat.dateTime.withZoneUTC.parseDateTime(timestamp)

  implicit def snsMessageReads: Reads[SNSMessage] =
    (
      (__ \ "Type").read[String] ~
        (__ \ "MessageId").read[String] ~
        (__ \ "TopicArn").read[String] ~
        (__ \ "Subject").readNullable[String] ~
        (__ \ "Timestamp").read[String].map(parseTimestamp) ~
        (__ \ "Message").read[String].map(Json.parse)
      )(SNSMessage(_, _, _, _, _, _))
}
