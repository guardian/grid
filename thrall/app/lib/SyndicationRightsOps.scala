package lib

import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.{Image, Photoshoot, SyndicationRights}
import play.api.libs.json.Json

import scala.concurrent.{ExecutionContext, Future}

class SyndicationRightsOps(es: ElasticSearchVersion)(implicit ex: ExecutionContext) {

  /**
    * Upserting syndication rights and updating photoshoots accordingly.
    * @param image - image that has been updated. Should include any new rights.
    * @param currentPhotoshootOpt - new photoshoot if that's the case
    * @param previousPhotoshootOpt - old photoshoot; defined when image had been moved to (or removed from) a photoshoot
    * @return
    */
  def upsertOrRefreshRights(image: Image,
                            currentPhotoshootOpt: Option[Photoshoot] = None,
                            previousPhotoshootOpt: Option[Photoshoot] = None): Future[Unit] = for {
    _ <- refreshPreviousPhotoshoot(image, previousPhotoshootOpt)
    _ <- newRightsUpsert(image, currentPhotoshootOpt)
  } yield ()

  private def newRightsUpsert(image: Image,
                              currentPhotoshootOpt: Option[Photoshoot]): Future[Unit] =
    image.syndicationRights match {
      case Some(_) => for {
          _ <- Future.sequence(es.updateImageSyndicationRights(image.id, image.syndicationRights))
          _ <- refreshCurrentPhotoshoot(image, currentPhotoshootOpt)
        } yield ()
      case None =>
        refreshCurrentPhotoshoot(image, currentPhotoshootOpt)
    }

  private def refreshPreviousPhotoshoot(image: Image, previousPhotoshootOpt: Option[Photoshoot]): Future[Unit] = previousPhotoshootOpt match {
    case Some(photoshoot) => refreshPhotoshoot(image, photoshoot, Some(image.id))
    case None => Future.successful(())
  }

  private def refreshCurrentPhotoshoot(image: Image, currentPhotoshootOpt: Option[Photoshoot]): Future[Unit] = currentPhotoshootOpt match {
    case Some(photoshoot) => refreshPhotoshoot(image, photoshoot)
    case None =>
      if (image.hasInferredSyndicationRightsOrNoRights) Future.sequence(es.deleteSyndicationRights(image.id)).map(_ => ())
      else Future.successful(())
  }

  private def refreshPhotoshoot(image: Image, photoshoot: Photoshoot, excludedImageId: Option[String] = None): Future[Unit] = for {
    latestRights <- getLatestSyndicationRights(image, photoshoot, excludedImageId)
    inferredImages <- getInferredSyndicationRightsImages(image, photoshoot, excludedImageId)
  } yield updateRights(image, photoshoot, latestRights, inferredImages)

  private def updateRights(image: Image, photoshoot: Photoshoot, latestRights: Option[SyndicationRights], inferredImages: List[Image]): Unit = latestRights match {
    case updatedRights@Some(rights) if inferredImages.exists(_.syndicationRights.isDefined) || image.syndicationRights.isDefined =>
      GridLogger.info(s"Using rights ${Json.toJson(rights)} to infer syndication rights for image ids (photoshoot $photoshoot): ${inferredImages.map(_.id)} (total = ${inferredImages.length}).")
      inferredImages.foreach(img => es.updateImageSyndicationRights(img.id, updatedRights.map(_.copy(isInferred = true))))
    case None if image.syndicationRights.isDefined =>
      GridLogger.info(s"Removing rights from images (photoshoot $photoshoot): ${inferredImages.map(_.id)} (total = ${inferredImages.length}).")
      inferredImages.foreach(img => es.updateImageSyndicationRights(img.id, None))
    case _ =>
      GridLogger.info(s"No rights to refresh in photoshoot $photoshoot")
  }

  /* The following methods are needed because ES is eventually consistent.
   * When we move an image into a photoshoot we have to refresh the photoshoot by querying for the latest syndication
   * rights and for all the images that have inferred rights.
   * Without these helpers the image that has just been moved into the photoshoot will not be taken into account and we
   * risk missing important rights information.
   * Therefore, we have to make sure we are taking it into consideration.
   */
  private def getLatestSyndicationRights(image: Image,
                                         photoshoot: Photoshoot,
                                         excludedImageId: Option[String] = None): Future[Option[SyndicationRights]] =
    excludedImageId match {
      case Some(_) =>
        es.getLatestSyndicationRights(photoshoot, excludedImageId).map(_.flatMap(_.syndicationRights))
      case None =>
        val hasInferredRights: Boolean = image.hasInferredSyndicationRightsOrNoRights
        es.getLatestSyndicationRights(photoshoot).map {
          case Some(dbImage) =>
            if (!hasInferredRights) mostRecentSyndicationRights(dbImage, image) else dbImage.syndicationRights
          case None =>
            if (!hasInferredRights) image.syndicationRights else None
        }
    }

  def mostRecentSyndicationRights(image1: Image, image2: Image): Option[SyndicationRights] = (image1.rcsPublishDate, image2.rcsPublishDate) match {
    case (Some(date1), Some(date2)) => if(date1.isAfter(date2)) image1.syndicationRights else image2.syndicationRights
    case (Some(_), None) => image1.syndicationRights
    case (None, Some(_)) => image2.syndicationRights
    case (None, None) => None
  }

  private def getInferredSyndicationRightsImages(image: Image,
                                                 photoshoot: Photoshoot,
                                                 excludedImageId: Option[String] = None): Future[List[Image]] =
    excludedImageId match {
      case Some(_) => es.getInferredSyndicationRightsImages(photoshoot, excludedImageId)
      case None =>
        val imageId = if (!image.hasInferredSyndicationRightsOrNoRights) Some(image.id) else None
        es.getInferredSyndicationRightsImages(photoshoot, imageId).map { images =>
          if (image.hasInferredSyndicationRightsOrNoRights)
            images :+ image
          else
            images
        }
    }
}
