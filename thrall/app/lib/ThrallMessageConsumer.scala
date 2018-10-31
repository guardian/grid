package lib

import com.gu.mediaservice.lib.aws.MessageConsumer
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
      case SyndicationNotifications.refreshSubject => upsertSyndicationRights
      case SyndicationNotifications.deleteSubject  => deleteInferredRights
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
    (rights \ "data").validate[SyndicationRights].fold(
      err => {
        val msg = s"Unable to parse message as SyndicationRights ${JsError.toJson(err).toString}"
        GridLogger.error(msg)
        Future.failed(SNSBodyParseError(msg))
      },
      syndicationRights => withImageId(rights) { id =>
        GridLogger.info(s"upserting syndication rights", Map("image-id" -> id, "inferred" -> syndicationRights.isInferred))

        es.getImage(id) map {
          case Some(image) =>
            if (!syndicationRights.isInferred) {
              syndicationRightsOps.refreshInferredRights(image, syndicationRights)
            }

            Future.sequence(
              es.updateImageSyndicationRights(id, Some(syndicationRights))
            )
          case _ =>
            GridLogger.info(s"image $id not found")
            None
        }
      }
    )
  }

  def updateImagePhotoshoot(message: JsValue) = {
    (message \ "data").validate[Edits].fold(
      err => {
        val msg = s"Unable to parse message as Edits ${JsError.toJson(err).toString}"
        GridLogger.error(msg)
        Future.failed(SNSBodyParseError(msg))
      },
      upcomingEdits => withImageId(message) { id => {
        GridLogger.info("updating photoshoot", id)

        es.getImage(id) map {
          case Some(image) =>
            image.syndicationRights match {
              case Some(rights) if !rights.isInferred =>
                syndicationRightsOps.moveExplicitRightsToPhotoshoot(image, upcomingEdits.photoshoot)
              case _ =>
                syndicationRightsOps.moveInferredRightsToPhotoshoot(image, upcomingEdits.photoshoot)
            }

            updateImageUserMetadata(message)
          case _ =>
            GridLogger.info(s"image not found", id)
            None
        }
      }}
    )
  }

  def deleteInferredRights(message: JsValue) = Future.sequence(
    withImageId(message)(id => es.deleteSyndicationRights(id))
  )
}

// TODO: improve and use this (for logging especially) else where.
case class EsResponse(message: String)
case class SNSBodyParseError(message: String) extends Exception
