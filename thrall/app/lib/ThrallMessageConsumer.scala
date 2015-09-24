package lib

import _root_.play.api.libs.json._
import com.gu.mediaservice.lib.aws.MessageConsumer
import org.elasticsearch.action.deletebyquery.DeleteByQueryResponse
import org.elasticsearch.action.update.UpdateResponse
import play.api.Logger

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
      case "delete-image-exports"       => deleteImageExports
      case "update-image-user-metadata" => updateImageUserMetadata
      case "heartbeat"                  => heartbeat
    }

  def heartbeat(msg: JsValue) = Future {
    None
  }

  def indexImage(image: JsValue): Future[UpdateResponse] =
    withImageId(image)(id => ElasticSearch.indexImage(id, image))

  def updateImageExports(exports: JsValue): Future[UpdateResponse] =
    withImageId(exports)(id => ElasticSearch.updateImageExports(id, exports \ "data"))

  def deleteImageExports(exports: JsValue): Future[UpdateResponse] =
    withImageId(exports)(id => ElasticSearch.deleteImageExports(id))

  def updateImageUserMetadata(metadata: JsValue): Future[UpdateResponse] =
    withImageId(metadata)(id => ElasticSearch.applyImageMetadataOverride(id, metadata \ "data"))

  // The Unit, Unit is due to the two sied effects
  def deleteImage(image: JsValue): Future[Either[ImageDeletedResponse, ImageNotDeletableResponse]] =
    withImageId(image) { id =>
      ElasticSearch.deleteImage(id).map { deleteResponse =>
        deleteResponse.left.map { imageDeletedResponse =>
          ImageStore.deleteOriginal(id)
          ImageStore.deleteThumbnail(id)
          DynamoNotifications.publish(Json.obj("id" -> id), "image-deleted")
          imageDeletedResponse
        }
      }
    }
}

// TODO: improve and use this (for logging especially) else where.
case class EsResponse(message: String)
