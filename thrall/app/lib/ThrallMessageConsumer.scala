package lib

import _root_.play.api.libs.json._
import com.gu.mediaservice.lib.aws.MessageConsumer
import org.elasticsearch.action.deletebyquery.DeleteByQueryResponse
import org.elasticsearch.action.update.UpdateResponse

import scala.concurrent.Future
import play.api.libs.concurrent.Execution.Implicits._

object ThrallMessageConsumer extends MessageConsumer(
  Config.queueUrl, Config.awsEndpoint, Config.awsCredentials, ThrallMetrics.processingLatency) {

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] =
    PartialFunction.condOpt(subject) {
      case "image"                      => indexImage
      case "delete-image"               => deleteImage
      case "update-image"               => indexImage
      case "update-image-exports"       => updateImageExports
      case "update-image-user-metadata" => updateImageUserMetadata
      case "heartbeat"                  => heartbeat
    }

  def heartbeat(msg: JsValue) = Future {
    None
  }

  def indexImage(image: JsValue): Future[Unit] =
    withImageId(image)(id => {
      ElasticSearch.indexImage(id, image)
      Future(ImageUploadNotifications.publish(image, "new-image"))
    })

  def updateImageExports(exports: JsValue): Future[UpdateResponse] =
    withImageId(exports)(id => ElasticSearch.updateImageExports(id, exports \ "data"))

  def updateImageUserMetadata(metadata: JsValue): Future[UpdateResponse] =
    withImageId(metadata)(id => ElasticSearch.applyImageMetadataOverride(id, metadata \ "data"))

  def deleteImage(image: JsValue): Future[EsResponse] =
    withImageId(image) { id =>
      // if we cannot delete the image as it's "protected", succeed and delete
      // the message anyway.
      ElasticSearch.deleteImage(id).map {
        case r: DeleteByQueryResponse => {
          ImageStore.deleteOriginal(id)
          ImageStore.deleteThumbnail(id)
          EsResponse(s"Image deleted: $id")
        }
      } recoverWith {
        case ImageNotDeletable => {
          Future.successful(EsResponse(s"Image cannot be deleted: $id"))
        }
      }
    }

  def withImageId[A](image: JsValue)(f: String => A): A =
    image \ "id" match {
      case JsString(id) => f(id)
      case _            => sys.error(s"No id field present in message body: $image")
    }
}

// TODO: improve and use this (for logging especially) else where.
case class EsResponse(message: String)
