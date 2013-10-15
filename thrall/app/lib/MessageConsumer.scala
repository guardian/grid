package lib

import scala.collection.JavaConverters._
import scala.concurrent.{Future, ExecutionContext}
import scala.concurrent.duration._

import com.amazonaws.services.sqs.AmazonSQSClient
import com.amazonaws.services.sqs.model.{Message => SQSMessage, DeleteMessageRequest, ReceiveMessageRequest}

import play.api.Logger
import play.api.libs.json._
import play.api.libs.functional.syntax._
import akka.actor.ActorSystem
import scalaz.syntax.id._

import com.gu.mediaservice.lib.json.PlayJsonHelpers._
import org.elasticsearch.action.index.IndexResponse
import org.elasticsearch.action.delete.DeleteResponse


object MessageConsumer {

  val actorSystem = ActorSystem("MessageConsumer")

  implicit val ctx: ExecutionContext = actorSystem.dispatcher

  def startSchedule(): Unit =
    actorSystem.scheduler.schedule(0.seconds, 1.seconds)(processMessages())

  lazy val client =
    new AmazonSQSClient(Config.awsCredentials) <| (_ setEndpoint Config.awsEndpoint)

  def processMessages(): Unit =
    for (msg <- poll(10)) {
      Logger.info("Processing message...")
      val message = extractSNSMessage(msg) getOrElse sys.error("Invalid message structure (not via SNS?)")
      val future = message.subject match {
        case Some("image")        => indexImage(message.body)
        case Some("delete-image") => deleteImage(message.body)
        case s                    => sys.error(s"Unrecognised message subject $s")
      }
      future |> deleteOnSuccess(msg)
    }

  def deleteOnSuccess(msg: SQSMessage)(f: Future[Any]): Unit =
    f.onSuccess { case _ => deleteMessage(msg) }

  def poll(max: Int): Seq[SQSMessage] =
    client.receiveMessage(new ReceiveMessageRequest(Config.queueUrl).withMaxNumberOfMessages(max))
      .getMessages.asScala.toList

  def extractSNSMessage(sqsMessage: SQSMessage): Option[SNSMessage] =
    Json.fromJson[SNSMessage](Json.parse(sqsMessage.getBody)) <| logParseErrors |> (_.asOpt)

  def indexImage(image: JsValue): Future[IndexResponse] =
    withImageId(image)(id => ElasticSearch.indexImage(id, image))

  def deleteImage(image: JsValue): Future[DeleteResponse] =
    withImageId(image)(ElasticSearch.deleteImage)

  def withImageId[A](image: JsValue)(f: String => A): A =
    image \ "id" match {
      case JsString(id) => f(id)
      case _            => sys.error(s"No id field present in message body: $image")
    }

  def deleteMessage(message: SQSMessage): Unit =
    client.deleteMessage(new DeleteMessageRequest(Config.queueUrl, message.getReceiptHandle))

}

case class SNSMessage(
  messageType: String,
  messageId: String,
  topicArn: String,
  subject: Option[String],
  body: JsValue
)

object SNSMessage {
  implicit def snsMessageReads: Reads[SNSMessage] =
    (
      (__ \ "Type").read[String] ~
      (__ \ "MessageId").read[String] ~
      (__ \ "TopicArn").read[String] ~
      (__ \ "Subject").readNullable[String] ~
      (__ \ "Message").read[String].map(Json.parse)
    )(SNSMessage(_, _, _, _, _))
}
