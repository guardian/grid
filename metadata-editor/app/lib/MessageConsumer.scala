package lib

import java.util.concurrent.Executors

import _root_.play.api.libs.functional.syntax._
import _root_.play.api.libs.json._
import akka.actor.ActorSystem
import com.amazonaws.services.cloudwatch.model.Dimension
import com.amazonaws.services.sqs.AmazonSQSClient
import com.amazonaws.services.sqs.model.{DeleteMessageRequest, Message => SQSMessage, ReceiveMessageRequest}
import com.gu.mediaservice.lib.config.MetadataConfig.StaffPhotographers
import com.gu.mediaservice.lib.json.PlayJsonHelpers._
import com.gu.mediaservice.model.Image
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat

import scala.annotation.tailrec
import scala.collection.JavaConverters._
import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future}
import scalaz.syntax.id._

object MessageConsumer {
  val actorSystem = ActorSystem("MessageConsumer")

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def startSchedule(): Unit =
    actorSystem.scheduler.scheduleOnce(0.seconds)(processMessages())

  lazy val client =
    new AmazonSQSClient(Config.awsCredentials) <| (_ setEndpoint Config.awsEndpoint)

  @tailrec
  def processMessages(): Unit = {
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
      } yield ()
      future |> deleteOnSuccess(msg)
    }

    processMessages()
  }

  def recordMessageLatency(message: SNSMessage) = {
    val latency = DateTime.now.getMillis - message.timestamp.getMillis
    val dimensions = message.subject match {
      case Some(subject) => List(new Dimension().withName("subject").withValue(subject))
      case None          => List()
    }
    MetadataEditorMetrics.processingLatency.runRecordOne(latency, dimensions)
  }

  def chooseProcessor(subject: String): Option[JsValue => Future[Any]] =
    PartialFunction.condOpt(subject) {
      case "new-image" => parseNewImage
    }

  def isStaffPhotographer(image: Image) = {
    image.metadata.byline match {
      case Some(byline: String) => StaffPhotographers.store.contains(byline)
      case _                    => false
    }
  }

  def parseNewImage(jsImage: JsValue): Future[Any] = {
    jsImage.asOpt[Image] match {
      case Some(image: Image) => {
        isStaffPhotographer(image) match {
          case true => DynamoEdits.setArchived(image.id, true)
          case _    => Future(image)
        }
      }
      case _ => sys.error("Couldn't parse json to Image")
    }
  }

  def deleteOnSuccess(msg: SQSMessage)(f: Future[Any]): Unit =
    f.onSuccess { case _ => deleteMessage(msg) }

  def getMessages(waitTime: Int, maxMessages: Int): Seq[SQSMessage] =
    client.receiveMessage(
      new ReceiveMessageRequest(Config.queueUrl)
        .withWaitTimeSeconds(waitTime)
        .withMaxNumberOfMessages(maxMessages)
    ).getMessages.asScala.toList

  def extractSNSMessage(sqsMessage: SQSMessage): Option[SNSMessage] =
    Json.fromJson[SNSMessage](Json.parse(sqsMessage.getBody)) <| logParseErrors |> (_.asOpt)

  def deleteMessage(message: SQSMessage): Unit =
    client.deleteMessage(new DeleteMessageRequest(Config.queueUrl, message.getReceiptHandle))

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
