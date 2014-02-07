package lib

import scala.collection.JavaConverters._
import scala.concurrent.{Future, ExecutionContext}
import scala.concurrent.duration._

import com.amazonaws.services.sqs.AmazonSQSClient
import com.amazonaws.services.sqs.model.{Message => SQSMessage, DeleteMessageRequest, ReceiveMessageRequest}
import org.elasticsearch.action.index.IndexResponse
import org.elasticsearch.action.delete.DeleteResponse
import org.elasticsearch.action.update.UpdateResponse
import _root_.play.api.libs.json._
import _root_.play.api.libs.functional.syntax._
import akka.actor.ActorSystem
import scalaz.syntax.id._

import com.gu.mediaservice.lib.json.PlayJsonHelpers._
import java.util.concurrent.Executors


object MessageConsumer {

  val actorSystem = ActorSystem("MessageConsumer")

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def startSchedule(): Unit =
    actorSystem.scheduler.schedule(0.seconds, 1.seconds)(processMessages())

  lazy val client =
    new AmazonSQSClient(Config.awsCredentials) <| (_ setEndpoint Config.awsEndpoint)

  def processMessages() {
    for (msg <- poll(10)) {
      val future = for {
        message <- Future(extractSNSMessage(msg) getOrElse sys.error("Invalid message structure (not via SNS?)"))
        processor = message.subject.flatMap(chooseProcessor)
        _ <- processor.fold(
          sys.error(s"Unrecognised message subject ${message.subject}"))(
          _.apply(message.body))
      } yield ()
      future |> deleteOnSuccess(msg)
    }
  }

  def chooseProcessor(subject: String): Option[JsValue => Future[Any]] =
    PartialFunction.condOpt(subject) {
      case "image"               => indexImage
      case "delete-image"        => deleteImage
      case "add-image-to-bucket" => addImageToBucket
      case "remove-image-from-bucket" => removeImageFromBucket
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
    withImageId(image) { id =>
      val future = ElasticSearch.deleteImage(id)
      future.onSuccess { case _ =>
        S3ImageStorage.deleteImage(id)
        S3ImageStorage.deleteThumbnail(id)
      }
      future
    }

  def addImageToBucket(image: JsValue): Future[UpdateResponse] =
    withImageId(image) { id =>
      string(image \ "bucket").fold(
        sys.error("No bucket found in request"))(
        ElasticSearch.addImageToBucket(id, _))
    }

  def removeImageFromBucket(image: JsValue): Future[UpdateResponse] =
    withImageId(image) { id =>
      string(image \ "bucket").fold(
        sys.error("No bucket found in request"))(
        ElasticSearch.removeImageFromBucket(id, _))
    }

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
