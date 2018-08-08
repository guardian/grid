package lib

import play.api.libs.json._
import com.gu.mediaservice.lib.aws.MessageConsumer
import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.{Image, SyndicationRights}
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
      case "refresh-inferred-rights"    => refreshInferredSyndicationRights
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

  def refreshInferredSyndicationRights(imageJson: JsValue) = {
    Future.sequence(
      withImageId(imageJson) { id =>
        val image = imageJson.as[Image]
        GridLogger.info(s"upserting inferred rights", id)
        es.updateImageSyndicationRights(id, image.syndicationRights)
      }
    )
  }

  def upsertSyndicationRights(rights: JsValue) = {
    (rights \ "data").validate[SyndicationRights].fold(
      err => {
        val msg = s"Unable to parse message as SyndicationRights ${JsError.toJson(err).toString}"
        GridLogger.error(msg)
        Future.failed(SNSBodyParseError(msg))
      },
      rightsFromRcs => withImageId(rights) { id =>
        es.getImage(id) map {
          case Some(image) => {
            GridLogger.info(s"Upserting syndication rights from RCS feed", image.id)
            es.updateImageSyndicationRights(id, Some(rightsFromRcs))

            image.userMetadata.map{edits => {
              edits.photoshoot match {
                case Some(photoshoot) if !rightsFromRcs.isInferred => {
                  // Image is in a photoshoot and has real rights
                  // Update the other images in the photoshoot
                  es.getImagesWithInferredSyndicationRights(photoshoot, image)
                    .map(initiateInferredRightsRefresh(_, rightsFromRcs))
                  image
                }
                case _ => image
              }
            }}
          }
          case _ => {
            GridLogger.info(s"image $id not found")
            None
          }
        }
      }
    )
  }

  private def initiateInferredRightsRefresh(images: List[Image], rightsFromRcs: SyndicationRights) = {
    GridLogger.info(s"initiating refresh of inferred rights for ${images.size} images")
    val inferredRights = rightsFromRcs.copy(published = None)

    images.foreach(image => {
      val updatedImage = image.copy(syndicationRights = Some(inferredRights))
      thrallNotifications.publish(Json.toJson(updatedImage), subject = "refresh-inferred-rights")
    })
  }
}

// TODO: improve and use this (for logging especially) else where.
case class EsResponse(message: String)
case class SNSBodyParseError(message: String) extends Exception
