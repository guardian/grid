package com.gu.mediaservice.lib.aws

import java.util.concurrent.Executors

import _root_.play.api.libs.functional.syntax._
import _root_.play.api.libs.json._
import org.apache.pekko.actor.ActorSystem
import com.amazonaws.services.cloudwatch.model.Dimension
import com.amazonaws.services.sqs.model.{Message => SQSMessage}
import com.gu.mediaservice.lib.ImageId
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.json.PlayJsonHelpers._
import com.gu.mediaservice.lib.metrics.Metric
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat

import scala.annotation.tailrec
import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future}

abstract class SqsViaSnsMessageConsumer(queueUrl: String, config: CommonConfig, metric: Metric[Long]) extends SimpleSqsMessageConsumer(queueUrl, config) with ImageId {
  val actorSystem = ActorSystem("MessageConsumer")

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def startSchedule(): Unit =
    actorSystem.scheduler.scheduleOnce(0.seconds)(processMessages())

  def chooseProcessor(subject: String): Option[JsValue => Future[Any]]

  @tailrec
  final def processMessages(): Unit = {
    for (msg <- getNextMessage()) {
      val future = for {
        message <- Future(extractSNSMessage(msg) getOrElse sys.error("Invalid message structure (not via SNS?)"))
        processor = message.subject.flatMap(chooseProcessor)
        _ <- processor.fold(
          sys.error(s"Unrecognised message subject ${message.subject}"))(
            _.apply(message.body))
        _ = recordMessageCount(message)
      } yield ()
      deleteOnSuccess(msg)(future)
    }

    processMessages()
  }

  private def recordMessageCount(message: SNSMessage) = {
    val dimensions = message.subject match {
      case Some(subject) => List(new Dimension().withName("subject").withValue(subject))
      case None          => List()
    }
    metric.recordOne(1L, dimensions)
  }

  private def deleteOnSuccess(msg: SQSMessage)(f: Future[Any]): Unit =
    f.foreach { _ => deleteMessage(msg) }

  private def extractSNSMessage(sqsMessage: SQSMessage): Option[SNSMessage] = {
    val result = Json.fromJson[SNSMessage](Json.parse(sqsMessage.getBody))
    logParseErrors(result)
    result.asOpt
  }

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
