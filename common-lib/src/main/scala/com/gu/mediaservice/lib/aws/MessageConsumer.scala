package com.gu.mediaservice.lib.aws

import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

import _root_.play.api.libs.functional.syntax._
import _root_.play.api.libs.json._
import akka.actor.ActorSystem
import com.amazonaws.auth.AWSCredentials
import com.amazonaws.services.cloudwatch.model.Dimension
import com.amazonaws.services.sqs.AmazonSQSClient
import com.amazonaws.services.sqs.model.{DeleteMessageRequest, Message => SQSMessage, ReceiveMessageRequest}
import com.gu.mediaservice.lib.json.PlayJsonHelpers._
import com.gu.mediaservice.lib.metrics.Metric
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat

import scala.annotation.tailrec
import scala.collection.JavaConverters._
import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future}
import scalaz.syntax.id._

abstract class MessageConsumer(queueUrl: String, awsEndpoint: String, awsCredentials: AWSCredentials, metric: Metric[Long]) {
  val actorSystem = ActorSystem("MessageConsumer")

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def startSchedule(): Unit =
    actorSystem.scheduler.scheduleOnce(0.seconds)(processMessages())

  lazy val client =
    new AmazonSQSClient(awsCredentials) <| (_ setEndpoint awsEndpoint)

  def chooseProcessor(subject: String): Option[JsValue => Future[Any]]

  val timeMessageLastProcessed = new AtomicReference[DateTime](DateTime.now)

  @tailrec
  final def processMessages(): Unit = {
    // Pull 1 message at a time to avoid starvation
    // Wait for maximum duration (20s) as per doc recommendation:
    // http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-long-polling.html
    for (msg <- getMessages(waitTime = 20, maxMessages = 1)) {
      val future = for {
        message <- Future(extractSNSMessage(msg) getOrElse sys.error("Invalid message structure (not via SNS?)"))
        processor = message.subject.flatMap(chooseProcessor)
        _ <- processor.fold(
          sys.error(s"Unrecognised message subject ${message.subject}"))(
            _.apply(message.body))
        _ = recordMessageLatency(message)
        _ = timeMessageLastProcessed.lazySet(DateTime.now)
      } yield ()
      future |> deleteOnSuccess(msg)
    }

    processMessages()
  }

  private def recordMessageLatency(message: SNSMessage) = {
    val latency = DateTime.now.getMillis - message.timestamp.getMillis
    val dimensions = message.subject match {
      case Some(subject) => List(new Dimension().withName("subject").withValue(subject))
      case None          => List()
    }
    metric.runRecordOne(latency, dimensions)
  }

  private def deleteOnSuccess(msg: SQSMessage)(f: Future[Any]): Unit =
    f.onSuccess { case _ => deleteMessage(msg) }

  private def getMessages(waitTime: Int, maxMessages: Int): Seq[SQSMessage] =
    client.receiveMessage(
      new ReceiveMessageRequest(queueUrl)
        .withWaitTimeSeconds(waitTime)
        .withMaxNumberOfMessages(maxMessages)
    ).getMessages.asScala.toList

  private def extractSNSMessage(sqsMessage: SQSMessage): Option[SNSMessage] =
    Json.fromJson[SNSMessage](Json.parse(sqsMessage.getBody)) <| logParseErrors |> (_.asOpt)

  private def deleteMessage(message: SQSMessage): Unit =
    client.deleteMessage(new DeleteMessageRequest(queueUrl, message.getReceiptHandle))

  def withImageId[A](image: JsValue)(f: String => A): A =
    image \ "id" match {
      case JsString(id) => f(id)
      case _            => sys.error(s"No id field present in message body: $image")
    }
}

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
