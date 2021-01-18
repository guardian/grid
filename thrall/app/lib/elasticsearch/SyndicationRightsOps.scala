package lib.elasticsearch

import com.gu.mediaservice.lib.logging._
import com.gu.mediaservice.model.{Image, Photoshoot, SyndicationRights}
import play.api.libs.json.Json
import org.joda.time.DateTime

import scala.concurrent.{ExecutionContext, Future}

class SyndicationRightsOps(es: ElasticSearch)(implicit ex: ExecutionContext) extends GridLogging {
  /**
    * Upserting syndication rights and updating photoshoots accordingly.
    * @param image - image that has been updated. Should include any new rights.
    * @param currentPhotoshootOpt - new photoshoot if that's the case
    * @param previousPhotoshootOpt - old photoshoot; defined when image had been moved to (or removed from) a photoshoot
    * @return
    */
  def upsertOrRefreshRights(image: Image,
                            currentPhotoshootOpt: Option[Photoshoot] = None,
                            previousPhotoshootOpt: Option[Photoshoot] = None,
                            lastModified: DateTime)(
                             implicit logMarker: LogMarker
                           ): Future[Unit] = for {
    _ <- refreshPreviousPhotoshoot(image, previousPhotoshootOpt, lastModified)
    _ <- newRightsUpsert(image, currentPhotoshootOpt, lastModified)
  } yield ()

  private def newRightsUpsert(image: Image,
                              currentPhotoshootOpt: Option[Photoshoot],
                              lastModified: DateTime
                             )
                             (
                               implicit logMarker: LogMarker
                             ): Future[Unit] =
    image.syndicationRights match {
      case Some(_) => for {
        _ <- Future.sequence(es.updateImageSyndicationRights(image.id, image.syndicationRights, lastModified))
        _ <- refreshCurrentPhotoshoot(image, currentPhotoshootOpt, lastModified)
      } yield ()
      case None =>
        refreshCurrentPhotoshoot(image, currentPhotoshootOpt, lastModified)
    }

  private def refreshPreviousPhotoshoot(image: Image,
                                        previousPhotoshootOpt: Option[Photoshoot],
                                        lastModified: DateTime
                                       )(
                                         implicit logMarker: LogMarker
                                       ): Future[Unit] =
    previousPhotoshootOpt match {
      case Some(photoshoot) => refreshPhotoshoot(image, photoshoot, Some(image.id), lastModified)
      case None => Future.successful(())
    }

  private def refreshCurrentPhotoshoot(image: Image,
                                       currentPhotoshootOpt: Option[Photoshoot],
                                       lastModified: DateTime)(
                                        implicit logMarker: LogMarker
                                      ): Future[Unit] =
    currentPhotoshootOpt match {
      case Some(photoshoot) => refreshPhotoshoot(image, photoshoot, None, lastModified)
      case None =>
        if (image.hasInferredSyndicationRightsOrNoRights)
          Future.sequence(es.deleteSyndicationRights(image.id, lastModified)).map(_ => ())
        else
          Future.successful(())
    }

  private def refreshPhotoshoot(image: Image,
                                photoshoot: Photoshoot,
                                excludedImageId: Option[String] = None,
                                lastModified: DateTime
                               )(
                                 implicit logMarker: LogMarker
                               ): Future[Unit] =
    for {
      latestRights <- getLatestSyndicationRights(image, photoshoot, excludedImageId)
      inferredImages <- getInferredSyndicationRightsImages(image, photoshoot, excludedImageId)
    } yield updateRights(image, photoshoot, latestRights, inferredImages, lastModified)

  private def updateRights(image: Image,
                           photoshoot: Photoshoot,
                           latestRights: Option[SyndicationRights],
                           inferredImages: List[Image],
                           lastModified: DateTime
                          )(
                            implicit logMarker: LogMarker
                          ): Unit =
    latestRights match {
      case updatedRights@Some(rights) if updateRequired(image, inferredImages) =>
        logger.info(s"Using rights ${Json.toJson(rights)} to infer syndication rights for ${inferredImages.length} image id(s) in photoshoot $photoshoot: ${inferredImages.map(_.id)}")
        inferredImages.foreach(img => es.updateImageSyndicationRights(img.id, updatedRights.map(_.copy(isInferred = true)), lastModified))
      case None if image.hasNonInferredRights =>
        logger.info(s"Removing rights from images (photoshoot $photoshoot): ${inferredImages.map(_.id)} (total = ${inferredImages.length}).")
        inferredImages.foreach(img => es.updateImageSyndicationRights(img.id, None, lastModified))
      case _ =>
        logger.info(s"No rights to refresh in photoshoot $photoshoot")
    }

  /* Only replace rights if at least one of the following is true:
   * - the image that triggered the action has syndication rights that are not inferred
   * - the list of images with inferred rights has at least one image with syndication rights (inferred or not inferred)
   * Both these condition indicate something has changed in the state of the photoshoot and we need to update the rights.
   */
  private def updateRequired(image: Image, inferredImages: List[Image]): Boolean = image.hasNonInferredRights || inferredImages.exists(_.syndicationRights.isDefined)

  /* The following methods are needed because ES is eventually consistent.
   * When we move an image into a photoshoot we have to refresh the photoshoot by querying for the latest syndication
   * rights and for all the images that have inferred rights.
   * Without these helpers the image that has just been moved into the photoshoot will not be taken into account and we
   * risk missing important rights information.
   * Therefore, we have to make sure we are taking it into consideration.
   */
  private def getLatestSyndicationRights(image: Image,
                                         photoshoot: Photoshoot,
                                         excludedImageId: Option[String] = None
                                        )(
                                          implicit logMarker: LogMarker
                                        ): Future[Option[SyndicationRights]] =
    excludedImageId match {
      case Some(_) => es.getLatestSyndicationRights(photoshoot, excludedImageId).map(_.flatMap(_.syndicationRights))
      case None =>
        val hasInferredRights: Boolean = image.hasInferredSyndicationRightsOrNoRights
        es.getLatestSyndicationRights(photoshoot, None).map {
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
                                                 excludedImageId: Option[String] = None
                                                )(
                                                  implicit logMarker: LogMarker
                                                ): Future[List[Image]] =
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
