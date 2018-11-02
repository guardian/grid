package lib

import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.{Image, Photoshoot, SyndicationRights}

import scala.concurrent.{ExecutionContext, Future}

class SyndicationRightsOps(
  es: ElasticSearch,
  notifications: SyndicationNotifications
)(implicit ex: ExecutionContext) {

  def refreshInferredRights(image: Image, rights: SyndicationRights): Future[Unit] =
    image.userMetadata.flatMap(_.photoshoot) match {
      case Some(photoshoot) if !rights.isInferred =>
        refreshRightsInferenceInPhotoshoot(photoshoot, rights, Some(image))
      case _ => Future.successful(())
    }

  def moveExplicitRightsToPhotoshoot(image: Image, maybeNewPhotoshoot: Option[Photoshoot]) = {
    def updateOldPhotoshoot(photoshoot: Photoshoot): Future[Unit] = {
      es.getLatestSyndicationRights(photoshoot, Some(image)) map {
        case Some(latestImageWithExplicitRights) if image.rcsPublishDate.get.isAfter(latestImageWithExplicitRights.rcsPublishDate.get) =>
          GridLogger.info(s"refreshing inferred syndication rights for images using ${latestImageWithExplicitRights.id} because ${image.id} has moved", Map("image-id" -> image.id, "photoshoot" -> photoshoot.title))
          refreshRightsInferenceInPhotoshoot(photoshoot, latestImageWithExplicitRights.syndicationRights.get, None)
        case None =>
          GridLogger.info(s"removing inferred rights from photoshoot as it no longer contains an image with direct rights", Map("image-id" -> image.id, "photoshoot" -> photoshoot.title))
          es.getInferredSyndicationRights(photoshoot, None)
            .map(notifications.sendRemoval)
        case _ => // no-op
      }
    }

    def updateNewPhotoshoot(photoshoot: Photoshoot): Future[Unit] = {
      es.getLatestSyndicationRights(photoshoot, None) map {
        case Some(latestImageWithExplicitRights) =>
          val imageWithMostRecentRights =
            if(image.rcsPublishDate.get.isAfter(latestImageWithExplicitRights.rcsPublishDate.get)) image
            else latestImageWithExplicitRights

          GridLogger.info(s"refreshing inferred syndication rights for images using ${imageWithMostRecentRights.id} because its the most recent", Map("image-id" -> imageWithMostRecentRights.id, "photoshoot" -> photoshoot.title))
          refreshRightsInferenceInPhotoshoot(photoshoot, imageWithMostRecentRights.syndicationRights.get, None)
        case None =>
          GridLogger.info(s"refreshing inferred syndication rights for images using ${image.id} because none previously existed", Map("image-id" -> image.id, "photoshoot" -> photoshoot.title))
          refreshRightsInferenceInPhotoshoot(photoshoot, image.syndicationRights.get, None)
        case _ => // no-op
      }
    }

    image.userMetadata.flatMap(_.photoshoot).map(updateOldPhotoshoot)
    maybeNewPhotoshoot.map(updateNewPhotoshoot)
  }

  def moveInferredRightsToPhotoshoot(image: Image, maybeNewPhotoshoot: Option[Photoshoot]): Unit = {
    val maybeOldPhotoshoot  = image.userMetadata.flatMap(_.photoshoot)

    (maybeOldPhotoshoot, maybeNewPhotoshoot) match {
      case (Some(oldPhotoshoot), None) =>
        GridLogger.info("image removed from photoshoot, removing inferred rights", Map("image-id" -> image.id, "photoshoot" -> oldPhotoshoot.title))
        notifications.sendRemoval(image)
      case (_, Some(newPhotoshoot)) =>
        es.getLatestSyndicationRights(newPhotoshoot, None) map {
          case Some(i) =>
            GridLogger.info(s"inferring rights from ${i.id} as its the most recent in new photoshoot", Map("image-id" -> image.id, "photoshoot" -> newPhotoshoot.title))
            notifications.sendRefresh(image, i.syndicationRights.get)
          case None =>
            GridLogger.info("cannot infer rights from new photoshoot, removing inferred rights", Map("image-id" -> image.id, "photoshoot" -> newPhotoshoot.title))
            notifications.sendRemoval(image)
        }
      case (None, None) => // no-op, shouldn't happen
    }
  }

  private def refreshRightsInferenceInPhotoshoot(photoshoot: Photoshoot, syndicationRights: SyndicationRights, excludedImage: Option[Image]): Future[Unit] = {
    GridLogger.info("refreshing inference of rights on photoshoot", Map("photoshoot" -> photoshoot.title))

    es.getInferredSyndicationRights(photoshoot, excludedImage)
      .map(notifications.sendRefresh(_, syndicationRights))
  }
}
