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

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] = {
    PartialFunction.condOpt(subject) {
      case "image"                      => indexImage
      case "delete-image"               => deleteImage
      case "update-image"               => indexImage
      case "delete-image-exports"       => deleteImageExports
      case "update-image-exports"       => updateImageExports
      case "update-image-user-metadata" => updateImageUserMetadata
      case "update-image-usages"        => updateImageUsages
      case "set-image-collections"      => setImageCollections
      case "heartbeat"                  => heartbeat
    }
  }

  def heartbeat(msg: JsValue) = Future {
    None
  }

  def updateImageUsages(usages: JsValue) =
   Future.sequence( withImageId(usages)(id => ElasticSearch.updateImageUsages(id, usages \ "data", usages \ "lastModified")) )

  def indexImage(image: JsValue): Future[List[UpdateResponse]] =
    Future.sequence( withImageId(image)(id => ElasticSearch.indexImage(id, image)) )

  def updateImageExports(exports: JsValue): Future[List[UpdateResponse]]=
    Future.sequence( withImageId(exports)(id => ElasticSearch.updateImageExports(id, exports \ "data")) )

  def deleteImageExports(exports: JsValue): Future[List[UpdateResponse]]=
    Future.sequence( withImageId(exports)(id => ElasticSearch.deleteImageExports(id)) )

  def updateImageUserMetadata(metadata: JsValue): Future[List[UpdateResponse]]= {
    val data = metadata \ "data"
    val lastModified = metadata \ "lastModified"
    Future.sequence( withImageId(metadata)(id => ElasticSearch.applyImageMetadataOverride(id, data, lastModified)))
  }


  def setImageCollections(collections: JsValue): Future[List[UpdateResponse]]=
    Future.sequence(withImageId(collections)(id => ElasticSearch.setImageCollection(id, collections \ "data")) )

  def deleteImage(image: JsValue): Future[List[EsResponse]] =
    Future.sequence(
      withImageId(image) { id =>
        // if we cannot delete the image as it's "protected", succeed and delete
        // the message anyway.
        ElasticSearch.deleteImage(id).map { requests =>
          requests.map {
            case r: DeleteByQueryResponse =>
              ImageStore.deleteOriginal(id)
              ImageStore.deleteThumbnail(id)
              ImageStore.deletePng(id)
              DynamoNotifications.publish(Json.obj("id" -> id), "image-deleted")
              EsResponse(s"Image deleted: $id")
          } recoverWith {
            case ImageNotDeletable =>
              Logger.info(s"Could not delete image $id")
              Future.successful(EsResponse(s"Image cannot be deleted: $id"))
          }
        }
      }
    )
}

// TODO: improve and use this (for logging especially) else where.
case class EsResponse(message: String)
