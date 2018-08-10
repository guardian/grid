package lib

import play.api.libs.json._
import com.gu.mediaservice.lib.aws.MessageConsumer
import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.{Edits, Image, Photoshoot, SyndicationRights}
import org.elasticsearch.action.delete.DeleteResponse
import org.elasticsearch.action.update.UpdateResponse

import scala.concurrent.{ExecutionContext, Future}

class ThrallMessageConsumer(
  config: ThrallConfig,
  es: ElasticSearch,
  thrallMetrics: ThrallMetrics,
  store: ThrallStore,
  dynamoNotifications: DynamoNotifications,
  thrallNotifications: ThrallNotifications
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
      case "set-image-collections"      => setImageCollections
      case "heartbeat"                  => heartbeat
      case "delete-usages"              => deleteAllUsages
      case "upsert-rcs-rights"          => upsertSyndicationRights
      case "refresh-inferred-rights"    => upsertSyndicationRights
      case "update-image-photoshoot"    => updateImagePhotoshoot
      case "delete-inferred-rights"     => deleteInferredRights
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
              dynamoNotifications.publish(Json.obj("id" -> id), "image-deleted")
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

  def upsertSyndicationRights(rights: JsValue): Future[List[UpdateResponse]] = {
    (rights \ "data").validate[SyndicationRights].fold(
      err => {
        val msg = s"Unable to parse message as SyndicationRights ${JsError.toJson(err).toString}"
        GridLogger.error(msg)
        Future.failed(SNSBodyParseError(msg))
      },
      syndicationRights => withImageId(rights) { id =>
        GridLogger.info(s"upserting syndication rights", Map("image-id" -> id, "inferred" -> syndicationRights.isInferred))

        if (!syndicationRights.isInferred) {
          refreshInferredSyndicationRights(id, syndicationRights)
        }

        Future.sequence(
          es.updateImageSyndicationRights(id, Some(syndicationRights))
        )
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
          case Some(image) => {
            image.syndicationRights match {
              case Some(rights) if !rights.isInferred => notInferred(image, upcomingEdits)
              case _ => inferred(image, upcomingEdits)
            }

            updateImageUserMetadata(message)
          }
          case _ => {
            GridLogger.info(s"image not found", id)
            None
          }
        }
      }}
    )
  }

  def deleteInferredRights(message: JsValue) = {
    Future.sequence(
      withImageId(message) { id =>
        GridLogger.info("deleting inferred rights", id)
        es.deleteSyndicationRights(id)
      }
    )
  }

  private def notInferred(image: Image, upcomingEdits: Edits) = {
    image.userMetadata.flatMap(_.photoshoot).foreach(currentPhotoshoot => {
      // lookup latest rcs published image in current shoot
      // compare to this image
      // if this image is most recent
      //    refresh shoot with second most recent if exists, else remove inferred rights
      // else no-op

      es.getMostRecentSyndicationRights(currentPhotoshoot, Some(image)) map {
        case Some(mostRecentImage) if image.rcsPublishDate.get.isAfter(mostRecentImage.rcsPublishDate.get) => {
          GridLogger.info(s"refreshing inferred syndication rights for images using ${mostRecentImage.id} because ${image.id} has moved", Map("image-id" -> image.id, "photoshoot" -> currentPhotoshoot.title))
          refreshInferredSyndicationRightsAcrossPhotoshoot(currentPhotoshoot, mostRecentImage.syndicationRights.get, None)
        }
        case None => {
          // remove all inferred syndication rights from photoshoot
          GridLogger.info(s"removing inferred rights from photoshoot as it no longer contains an image with direct rights", Map("image-id" -> image.id, "photoshoot" -> currentPhotoshoot.title))
          es.getImagesWithInferredSyndicationRights(currentPhotoshoot, None)
            .map(initiateRightsRemoval)
        }
        case _ => None // no-op
      }
    })

    upcomingEdits.photoshoot.foreach(newPhotoshoot => {
      // lookup latest rcs published image in new shoot
      // compare to this image
      // if this image is more recent, copy
      // else no-op

      es.getMostRecentSyndicationRights(newPhotoshoot, None) map {
        case Some(mostRecentImage) if image.rcsPublishDate.get.isAfter(mostRecentImage.rcsPublishDate.get) => {
          GridLogger.info(s"refreshing inferred syndication rights for images using ${image.id} because its the most recent", Map("image-id" -> image.id, "photoshoot" -> newPhotoshoot.title))
          refreshInferredSyndicationRightsAcrossPhotoshoot(newPhotoshoot, image.syndicationRights.get, None)
        }
        case None => {
          GridLogger.info(s"refreshing inferred syndication rights for images using ${image.id} because none previously existed", Map("image-id" -> image.id, "photoshoot" -> newPhotoshoot.title))
          refreshInferredSyndicationRightsAcrossPhotoshoot(newPhotoshoot, image.syndicationRights.get, None)
        }
        case _ => None // no-op
      }
    })
  }

  private def inferred(image: Image, upcomingEdits: Edits) = {
    val maybeCurrentPhotoshoot = image.userMetadata.flatMap(_.photoshoot)
    val maybeNewPhotoshoot = upcomingEdits.photoshoot

    (maybeCurrentPhotoshoot, maybeNewPhotoshoot) match {
      case (Some(_), None) => {
        // removed from photoshoot, remove inferred rights
        GridLogger.info("image removed from photoshoot, removing inferred rights", image.id)
        initiateRightsRemoval(List(image))
      }
      case (_, Some(newPhotoshoot)) => {
        // moved to new photoshoot
        // lookup latest rcs published image in new photoshoot
        // if exists replace inferred rights
        // else remove inferred rights

        es.getMostRecentSyndicationRights(newPhotoshoot, None) map {
          case Some(i) => {
            GridLogger.info(s"inferring rights from ${i.id} as its the most recent in photoshoot", image.id)
            initiateInferredRightsRefresh(List(image), i.syndicationRights.get)
          }
          case None => {
            GridLogger.info("cannot infer rights from new photoshoot", image.id)
            initiateRightsRemoval(List(image))
          }
        }
      }
      case (None, None) => None // no-op, shouldn't happen
    }
  }

  private def initiateRightsRemoval(images: List[Image]) = {
    images.foreach(image => thrallNotifications.publish(
      Json.obj("id" -> image.id),
      subject = "delete-inferred-rights"
    ))
  }

  private def refreshInferredSyndicationRights(id: String, syndicationRights: SyndicationRights) = {
    es.getImage(id) map {
      case Some(image) => {
        image.userMetadata.map { edits =>
          edits.photoshoot match {
            case Some(photoshoot) if !syndicationRights.isInferred => {
              refreshInferredSyndicationRightsAcrossPhotoshoot(photoshoot, syndicationRights, Some(image))
              image
            }
            case _ => image
          }
        }
      }
      case _ => {
        GridLogger.info(s"image $id not found")
        None
      }
    }
  }

  private def refreshInferredSyndicationRightsAcrossPhotoshoot(photoshoot: Photoshoot, syndicationRights: SyndicationRights, excludedImage: Option[Image]) = {
    GridLogger.info("setting inferred rights for photoshoot")
    es.getImagesWithInferredSyndicationRights(photoshoot, excludedImage)
      .map(initiateInferredRightsRefresh(_, syndicationRights))
  }

  private def initiateInferredRightsRefresh(images: List[Image], rightsFromRcs: SyndicationRights) = {
    GridLogger.info(s"initiating refresh of inferred rights for ${images.size} images")
    val inferredRights = rightsFromRcs.copy(published = None)

    images.foreach(image => {
      val message = Json.obj(
        "id" -> image.id,
        "data" -> Json.toJson(inferredRights)
      )

      thrallNotifications.publish(message, subject = "refresh-inferred-rights")
    })
  }
}

// TODO: improve and use this (for logging especially) else where.
case class EsResponse(message: String)
case class SNSBodyParseError(message: String) extends Exception
