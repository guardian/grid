package lib

import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.{Image, Photoshoot, SyndicationRights}

import scala.concurrent.ExecutionContext

class SyndicationRightsOps(
  es: ElasticSearch,
  notifications: SyndicationNotifications
)(implicit ex: ExecutionContext) {

  def refreshInferredRights(image: Image, rights: SyndicationRights) = {
    image.userMetadata.flatMap(_.photoshoot) match {
      case Some(photoshoot) if !rights.isInferred =>
        refreshRightsInferenceInPhotoshoot(photoshoot, rights, Some(image))
        image
      case _ => image
    }
  }

  def moveExplicitRightsToPhotoshoot(image: Image, maybeNewPhotoshoot: Option[Photoshoot]) = {
    def updateOldPhotoshoot(photoshoot: Photoshoot) = {
      es.getLatestSyndicationRights(photoshoot, Some(image)) map {
        case Some(latestImageWithExplicitRights) if image.rcsPublishDate.get.isAfter(latestImageWithExplicitRights.rcsPublishDate.get) => {
          GridLogger.info(s"refreshing inferred syndication rights for images using ${latestImageWithExplicitRights.id} because ${image.id} has moved", Map("image-id" -> image.id, "photoshoot" -> photoshoot.title))
          refreshRightsInferenceInPhotoshoot(photoshoot, latestImageWithExplicitRights.syndicationRights.get, None)
        }
        case None => {
          GridLogger.info(s"removing inferred rights from photoshoot as it no longer contains an image with direct rights", Map("image-id" -> image.id, "photoshoot" -> photoshoot.title))
          es.getInferredSyndicationRights(photoshoot, None)
            .map(notifications.sendRemoval)
        }
        case _ => None // no-op
      }
    }

    def updateNewPhotoshoot(photoshoot: Photoshoot) = {
      es.getLatestSyndicationRights(photoshoot, None) map {
        case Some(mostRecentImage) if image.rcsPublishDate.get.isAfter(mostRecentImage.rcsPublishDate.get) => {
          GridLogger.info(s"refreshing inferred syndication rights for images using ${image.id} because its the most recent", Map("image-id" -> image.id, "photoshoot" -> photoshoot.title))
          refreshRightsInferenceInPhotoshoot(photoshoot, image.syndicationRights.get, None)
        }
        case None => {
          GridLogger.info(s"refreshing inferred syndication rights for images using ${image.id} because none previously existed", Map("image-id" -> image.id, "photoshoot" -> photoshoot.title))
          refreshRightsInferenceInPhotoshoot(photoshoot, image.syndicationRights.get, None)
        }
        case _ => None // no-op
      }
    }

    for {
      _ <- image.userMetadata.flatMap(_.photoshoot).map(updateOldPhotoshoot)
      _ <- maybeNewPhotoshoot.map(updateNewPhotoshoot)
    } yield {
      image
    }
  }

  def moveInferredRightsToPhotoshoot(image: Image, maybeNewPhotoshoot: Option[Photoshoot]) = {
    val maybeOldPhotoshoot  = image.userMetadata.flatMap(_.photoshoot)

    (maybeOldPhotoshoot, maybeNewPhotoshoot) match {
      case (Some(_), None) => {
        GridLogger.info("image removed from photoshoot, removing inferred rights", image.id)
        notifications.sendRemoval(image)
      }
      case (_, Some(newPhotoshoot)) => {
        es.getLatestSyndicationRights(newPhotoshoot, None) map {
          case Some(i) => {
            GridLogger.info(s"inferring rights from ${i.id} as its the most recent in new photoshoot", image.id)
            notifications.sendRefresh(image, i.syndicationRights.get)
          }
          case None => {
            GridLogger.info("cannot infer rights from new photoshoot, removing inferred rights", image.id)
            notifications.sendRemoval(image)
          }
        }
      }
      case (None, None) => None // no-op, shouldn't happen
    }
  }

  private def refreshRightsInferenceInPhotoshoot(photoshoot: Photoshoot, syndicationRights: SyndicationRights, excludedImage: Option[Image]) = {
    GridLogger.info("refreshing inference of rights on photoshoot", Map("photoshoot" -> photoshoot.title))

    es.getInferredSyndicationRights(photoshoot, excludedImage)
      .map(notifications.sendRefresh(_, syndicationRights))
  }
}
