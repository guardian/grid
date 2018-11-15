package lib

import com.gu.mediaservice.lib.aws.{EsResponse, MessageConsumer}
import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.{Edits, SyndicationRights}
import org.elasticsearch.action.delete.DeleteResponse
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

class ThrallMessageConsumer(
  config: ThrallConfig,
  es: ElasticSearch,
  thrallMetrics: ThrallMetrics,
  store: ThrallStore,
  notifications: DynamoNotifications,
  syndicationRightsOps: SyndicationRightsOps
)(implicit ec: ExecutionContext) extends MessageConsumer(
  config.queueUrl,
  config.awsEndpoint,
  config,
  thrallMetrics.snsMessage
) {

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] = {
    PartialFunction.condOpt(subject) {
      case "image"                      => indexImage
      case "delete-image"               => deleteImage
      case "update-image"               => indexImage
      case "delete-image-exports"       => deleteImageExports
      case "update-image-exports"       => updateImageExports
      case "update-image-user-metadata" => updateImageUserMetadata
      case "update-image-usages"        => updateImageUsages
      case "update-image-leases"        => updateImageLeases
      case "add-image-lease"            => addImageLease
      case "remove-image-lease"         => removeImageLease
      case "set-image-collections"      => setImageCollections
      case "heartbeat"                  => heartbeat
      case "delete-usages"              => deleteAllUsages
      case "upsert-rcs-rights"          => upsertSyndicationRights
      case "update-image-photoshoot"    => updateImagePhotoshoot
    }
  }

  def heartbeat(msg: JsValue) = Future {
    None
  }

  def updateImageUsages(usages: JsValue) =
   Future.sequence( withImageId(usages)(id => es.updateImageUsages(id, usages \ "data", usages \ "lastModified")) )

  def indexImage(image: JsValue) =
    Future.sequence( withImageId(image)(id => es.indexImage(id, image)) )

  def updateImageExports(exports: JsValue) =
    Future.sequence( withImageId(exports)(id => es.updateImageExports(id, exports \ "data")) )

  def deleteImageExports(exports: JsValue) =
    Future.sequence( withImageId(exports)(id => es.deleteImageExports(id)) )

  def updateImageUserMetadata(metadata: JsValue) = {
    val data = metadata \ "data"
    val lastModified = metadata \ "lastModified"
    Future.sequence( withImageId(metadata)(id => es.applyImageMetadataOverride(id, data, lastModified)))
  }

  def updateImageLeases(leaseByMedia: JsValue) =
    Future.sequence( withImageId(leaseByMedia)(id => es.updateImageLeases(id, leaseByMedia \ "data", leaseByMedia \ "lastModified")) )

  def addImageLease(lease: JsValue) =
    Future.sequence( withImageId(lease)(id => es.addImageLease(id, lease \ "data", lease \ "lastModified")) )

  def removeImageLease(leaseInfo: JsValue) =
    Future.sequence( withImageId(leaseInfo)(id => es.removeImageLease(id, leaseInfo \ "leaseId", leaseInfo \ "lastModified")) )

  def setImageCollections(collections: JsValue) =
    Future.sequence(withImageId(collections)(id => es.setImageCollection(id, collections \ "data")) )

  def deleteImage(image: JsValue) =
    Future.sequence(
      withImageId(image) { id =>
        // if we cannot delete the image as it's "protected", succeed and delete
        // the message anyway.
        es.deleteImage(id).map { requests =>
          requests.map {
            case r: DeleteResponse =>
              store.deleteOriginal(id)
              store.deleteThumbnail(id)
              store.deletePng(id)
              notifications.publish(Json.obj("id" -> id), "image-deleted")
              EsResponse(s"Image deleted: $id")
          } recoverWith {
            case ImageNotDeletable =>
              GridLogger.info("Could not delete image", id)
              Future.successful(EsResponse(s"Image cannot be deleted: $id"))
          }
        }
      }
    )

  def deleteAllUsages(usage: JsValue) =
    Future.sequence( withImageId(usage)(id => es.deleteAllImageUsages(id)) )

  def upsertSyndicationRights(rights: JsValue) = {
    withData[SyndicationRights](rights){ syndicationRights =>
      withImageId(rights) { id =>
        es.getImage(id) map {
          case Some(image) =>
            GridLogger.info(s"Upserting syndication rights for image $id", id)
            syndicationRightsOps.upsertOrRefreshRights(
              image = image,
              currentPhotoshootOpt = image.userMetadata.flatMap(_.photoshoot),
              newRightsOpt =  Some(syndicationRights)
            )
          case _ => GridLogger.info(s"Image $id not found")
        }
      }
    }
  }

  def updateImagePhotoshoot(message: JsValue) = {
    withData[Edits](message) { upcomingEdits =>
      withImageId(message) { id =>
        for {
          imageOpt <- es.getImage(id)
          prevPhotoshootOpt = imageOpt.flatMap(_.userMetadata.flatMap(_.photoshoot))
          _ <- updateImageUserMetadata(message)
          _ <- syndicationRightsOps.upsertOrRefreshRights(
            image = imageOpt.get,
            currentPhotoshootOpt = upcomingEdits.photoshoot,
            previousPhotoshootOpt = prevPhotoshootOpt
          )
        } yield GridLogger.info(s"Moved image $id from $prevPhotoshootOpt to ${upcomingEdits.photoshoot}", id)
      }
    }
  }
}