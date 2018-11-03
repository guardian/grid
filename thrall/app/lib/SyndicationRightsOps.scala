package lib

import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.{Photoshoot, SyndicationRights}

import scala.concurrent.{ExecutionContext, Future}

class SyndicationRightsOps(es: ElasticSearch)(implicit ex: ExecutionContext) {

  /**
    * Upserting syndication rights and updating photoshoots accordingly.
    * @param imageId - id of the image that has been updated
    * @param currentPhotoshootOpt - new photoshoot if that's the case
    * @param previousPhotoshootOpt - old photoshoot; defined when image had been moved (or removed) from a photoshoot
    * @param newRightsOpt - syndication rights
    * @return
    */
  def upsertOrRefreshRights(imageId: String,
                            currentPhotoshootOpt: Option[Photoshoot] = None,
                            previousPhotoshootOpt: Option[Photoshoot] = None,
                            newRightsOpt: Option[SyndicationRights] = None): Future[Unit] = for {
    _ <- refreshPreviousPhotoshoot(imageId, previousPhotoshootOpt)
    _ <- newRightsUpsert(imageId, currentPhotoshootOpt, newRightsOpt)
  } yield ()

  private def newRightsUpsert(imageId: String,
                              currentPhotoshootOpt: Option[Photoshoot],
                              newRightsOpt: Option[SyndicationRights]): Future[Unit] =
    newRightsOpt match {
      case Some(_) => for {
          _ <- Future.sequence(es.updateImageSyndicationRights(imageId, newRightsOpt))
          _ <- refreshCurrentPhotoshoot(currentPhotoshootOpt)
        } yield ()
      case None =>
        refreshCurrentPhotoshoot(currentPhotoshootOpt)
    }

  private def refreshPreviousPhotoshoot(imageId: String, previousPhotoshootOpt: Option[Photoshoot]): Future[Unit] =
    previousPhotoshootOpt match {
      case Some(photoshoot) => refreshPhotoshoot(photoshoot, Some(imageId))
      case None => Future.successful(())
    }

  private def refreshCurrentPhotoshoot(currentPhotoshootOpt: Option[Photoshoot]): Future[Unit] =
    currentPhotoshootOpt match {
      case Some(photoshoot) => refreshPhotoshoot(photoshoot)
      case None => Future.successful(())
    }

  private def refreshPhotoshoot(photoshoot: Photoshoot, excludedImageId: Option[String] = None): Future[Unit] = for {
    imageWithLatestRights <- es.getLatestSyndicationRights(photoshoot, excludedImageId)
    inferredImages <- es.getInferredSyndicationRights(photoshoot, excludedImageId)
    latestRights = imageWithLatestRights.flatMap(_.syndicationRights)
  } yield {
    GridLogger.info(s"Using rights from image ${imageWithLatestRights.map(_.id)} to infer rights for images: ${inferredImages.map(_.id)}")
    inferredImages.foreach(img => es.updateImageSyndicationRights(img.id, latestRights.map(_.copy(isInferred = true))))
  }
}
