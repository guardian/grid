package com.gu.mediaservice.lib.aws

import java.util.concurrent.{Executors, TimeUnit}
import java.util.concurrent.atomic.AtomicReference

import _root_.play.api.libs.functional.syntax._
import _root_.play.api.libs.json._
import com.amazonaws.services.cloudwatch.model.Dimension
import com.amazonaws.services.sqs.model.{DeleteMessageRequest, ReceiveMessageRequest, Message => SQSMessage}
import com.amazonaws.services.sqs.{AmazonSQS, AmazonSQSClientBuilder}
import com.gu.mediaservice.lib.Logging
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.metrics.Metric
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import scalaz.syntax.id._

import scala.annotation.tailrec
import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}

// TODO MRB: move this to metadata project once Thrall is running off Kinesis
abstract class MessageConsumer(queueUrl: String, awsEndpoint: String, config: CommonConfig, metric: Metric[Long]) extends Logging {
  private val executor = Executors.newCachedThreadPool()
  private implicit val executionContext: ExecutionContext = ExecutionContext.fromExecutor(executor)

  def startSchedule(): Unit = {
    executor.submit(new Runnable {
      override def run(): Unit = {
        processMessages()
      }
    })
  }

  def terminate(): Future[Unit] = Future {
    executor.shutdown()
    executor.awaitTermination(1, TimeUnit.MINUTES)
  }

  def isTerminated: Boolean = executor.isTerminated

  lazy val client: AmazonSQS = config.withAWSCredentials(AmazonSQSClientBuilder.standard()).build()

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
        _ = recordMessageCount(message)
        _ = timeMessageLastProcessed.lazySet(DateTime.now)
      } yield ()
      future |> deleteOnSuccess(msg)
    }

    processMessages()
  }

  private def recordMessageCount(message: SNSMessage) = {
    val dimensions = message.subject match {
      case Some(subject) => List(new Dimension().withName("subject").withValue(subject))
      case None          => List()
    }
    metric.runRecordOne(1L, dimensions)
  }

  private def deleteOnSuccess(msg: SQSMessage)(f: Future[Any]): Unit =
    f.foreach { _ => deleteMessage(msg) }

  private def getMessages(waitTime: Int, maxMessages: Int): Seq[SQSMessage] =
    client.receiveMessage(
      new ReceiveMessageRequest(queueUrl)
        .withWaitTimeSeconds(waitTime)
        .withMaxNumberOfMessages(maxMessages)
    ).getMessages.asScala.toList

  private def extractSNSMessage(sqsMessage: SQSMessage): Option[SNSMessage] = {
    Json.parse(sqsMessage.getBody).validate[SNSMessage] match {
      case JsSuccess(value, _) =>
        Some(value)

      case JsError(errors) =>
        val errorStrings = errors.map { case(path, subErrors) => s"$path -> [${subErrors.mkString(",")}]"}

        Logger.error(s"Validation errors in SQS message: ${errorStrings.mkString("\n")}")
        None
    }
  }

  private def deleteMessage(message: SQSMessage): Unit =
    client.deleteMessage(new DeleteMessageRequest(queueUrl, message.getReceiptHandle))

  def withImageId[A](image: JsValue)(f: String => A): A =
    (image \ "id").validate[String].asOpt.map(f).getOrElse {
      sys.error(s"No id field present in message body: $image")
    }

  def withData[A : Reads](message: JsValue)(f: A => Future[Unit]): Future[Unit] =
    (message \ "data").validate[A].fold(
      err => {
        val msg = s"Unable to parse message as Edits ${JsError.toJson(err).toString}"
        Logger.error(msg)
        Future.failed(SNSBodyParseError(msg))
      }, data => f(data)
    )
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
