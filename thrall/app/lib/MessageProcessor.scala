package lib

import com.gu.mediaservice.lib.ImageId
import com.gu.mediaservice.lib.aws.{EsResponse, Kinesis, UpdateMessage}
import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.{Edits, MediaLease, SyndicationRights}
import play.api.libs.json.{JsError, JsValue, Reads}

import scala.concurrent.{ExecutionContext, Future}

class MessageProcessor(es: ElasticSearchVersion,
                       store: ThrallStore,
                       metadataNotifications: MetadataNotifications,
                       syndicationRightsOps: SyndicationRightsOps,
                       kinesis: Kinesis
                      ) extends ImageId {

  def chooseProcessor(subject: String)(implicit ec: ExecutionContext): Option[JsValue => Future[Any]] = {
    PartialFunction.condOpt(subject) {
      case "image" => indexImage
      case "delete-image" => deleteImage
      case "update-image" => indexImage
      case "delete-image-exports" => deleteImageExports
      case "update-image-exports" => updateImageExports
      case "update-image-user-metadata" => updateImageUserMetadata
      case "update-image-usages" => updateImageUsages
      case "replace-image-leases" => replaceImageLeases
      case "add-image-lease" => addImageLease
      case "remove-image-lease" => removeImageLease
      case "set-image-collections" => setImageCollections
      case "heartbeat" => heartbeat
      case "delete-usages" => deleteAllUsages
      case "upsert-rcs-rights" => upsertSyndicationRights
      case "update-image-photoshoot" => updateImagePhotoshoot
    }
  }

  def heartbeat(msg: JsValue)(implicit ec: ExecutionContext) = Future {
    None
  }

  def updateImageUsages(usages: JsValue)(implicit ec: ExecutionContext) =
    Future.sequence(withImageId(usages)(id => es.updateImageUsages(id, usages \ "data", usages \ "lastModified")))

  def indexImage(image: JsValue)(implicit ec: ExecutionContext) =
    Future.sequence(withImageId(image)(id => es.indexImage(id, image)))

  def updateImageExports(exports: JsValue)(implicit ec: ExecutionContext) =
    Future.sequence(withImageId(exports)(id => es.updateImageExports(id, exports \ "data")))

  def deleteImageExports(exports: JsValue)(implicit ec: ExecutionContext) =
    Future.sequence(withImageId(exports)(id => es.deleteImageExports(id)))

  def updateImageUserMetadata(metadata: JsValue)(implicit ec: ExecutionContext) = {
    val data = metadata \ "data"
    val lastModified = metadata \ "lastModified"
    Future.sequence(withImageId(metadata)(id => es.applyImageMetadataOverride(id, data, lastModified)))
  }

  def replaceImageLeases(leaseNotice: JsValue)(implicit ec: ExecutionContext) = {
    withImageId(leaseNotice) { id =>
      getLeasesFromLeaseNotice(leaseNotice) match {
        case Some(leases) => Future.sequence(es.replaceImageLeases(id, leases))
        case None => Future.successful(List.empty)
      }
    }
  }

  def addImageLease(lease: JsValue)(implicit ec: ExecutionContext) =
    Future.sequence(withImageId(lease)(id => es.addImageLease(id, lease \ "data", lease \ "lastModified")))

  def removeImageLease(leaseInfo: JsValue)(implicit ec: ExecutionContext) =
    Future.sequence(withImageId(leaseInfo)(id => es.removeImageLease(id, leaseInfo \ "leaseId", leaseInfo \ "lastModified")))

  def setImageCollections(collections: JsValue)(implicit ec: ExecutionContext) =
    Future.sequence(withImageId(collections)(id => es.setImageCollection(id, collections \ "data")))

  def deleteImage(image: JsValue)(implicit ec: ExecutionContext) =
    Future.sequence(
      withImageId(image) { id =>
        // if we cannot delete the image as it's "protected", succeed and delete
        // the message anyway.
        es.deleteImage(id).map { requests =>
          requests.map {
            case _: ElasticSearchDeleteResponse =>
              //store.deleteOriginal(id)
              //store.deleteThumbnail(id)
              //store.deletePng(id)
              //metadataNotifications.publish(Json.obj("id" -> id), "image-deleted")
              EsResponse(s"Image deleted: $id")
          } recoverWith {
            case ImageNotDeletable =>
              GridLogger.info("Could not delete image", id)
              Future.successful(EsResponse(s"Image cannot be deleted: $id"))
          }
        }
      }
    )

  def deleteAllUsages(usage: JsValue)(implicit ec: ExecutionContext) =
    Future.sequence(withImageId(usage)(id => es.deleteAllImageUsages(id)))

  def upsertSyndicationRights(message: JsValue)(implicit ec: ExecutionContext) = {
    withData[SyndicationRights](message) { syndicationRights =>
      withImageId(message) { id =>

        es.getImage(id) map {
          case Some(image) =>
            val photoshoot = image.userMetadata.flatMap(_.photoshoot)
            GridLogger.info(s"Upserting syndication rights for image $id in photoshoot $photoshoot with rights $syndicationRights", id)

            syndicationRightsOps.upsertOrRefreshRights(
              image = image.copy(syndicationRights = Some(syndicationRights)),
              currentPhotoshootOpt = photoshoot
            )
          case _ => GridLogger.info(s"Image $id not found")
        }

        Future.successful {
          // Mirror RCS messages onto Kinesis for migration. It was not possible to write to Kinesis from the RCS lambda
          val updateMessage = UpdateMessage(subject = "upsert-rcs-rights", id = Some(id), syndicationRights = Some(syndicationRights))
          kinesis.publish(updateMessage)
        }
      }
    }
  }

  def updateImagePhotoshoot(message: JsValue)(implicit ec: ExecutionContext) = {
    withData[Edits](message) { upcomingEdits =>
      withImageId(message) { id =>
        for {
          imageOpt <- es.getImage(id)
          prevPhotoshootOpt = imageOpt.flatMap(_.userMetadata.flatMap(_.photoshoot))
          _ <- updateImageUserMetadata(message)
          _ <- {
            GridLogger.info(s"Upserting syndication rights for image $id. Moving from photoshoot $prevPhotoshootOpt to ${upcomingEdits.photoshoot}.")
            syndicationRightsOps.upsertOrRefreshRights(
              image = imageOpt.get,
              currentPhotoshootOpt = upcomingEdits.photoshoot,
              previousPhotoshootOpt = prevPhotoshootOpt
            )
          }
        } yield GridLogger.info(s"Moved image $id from $prevPhotoshootOpt to ${upcomingEdits.photoshoot}", id)
      }
    }
  }

  private def withData[A: Reads](message: JsValue)(f: A => Future[Unit]): Future[Unit] =
    (message \ "data").validate[A].fold(
      err => {
        val msg = s"Unable to parse message as Edits ${JsError.toJson(err).toString}"
        GridLogger.error(msg)
        Future.failed(new RuntimeException(msg))
      }, data => f(data)
    )

  private def getLeasesFromLeaseNotice[A](message: JsValue): Option[Seq[MediaLease]] = {
    (message \ "data" \ "leases").validate[Seq[MediaLease]].asOpt
  }
}
