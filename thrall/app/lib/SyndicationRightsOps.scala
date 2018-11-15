package lib

import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.{Image, Photoshoot, SyndicationRights}

import scala.concurrent.{ExecutionContext, Future}

class SyndicationRightsOps(es: ElasticSearch)(implicit ex: ExecutionContext) {

  /**
    * Upserting syndication rights and updating photoshoots accordingly.
    * @param image - image that has been updated
    * @param currentPhotoshootOpt - new photoshoot if that's the case
    * @param previousPhotoshootOpt - old photoshoot; defined when image had been moved to (or removed from) a photoshoot
    * @param newRightsOpt - syndication rights
    * @return
    */
  def upsertOrRefreshRights(image: Image,
                            currentPhotoshootOpt: Option[Photoshoot] = None,
                            previousPhotoshootOpt: Option[Photoshoot] = None,
                            newRightsOpt: Option[SyndicationRights] = None): Future[Unit] = for {
    _ <- refreshPreviousPhotoshoot(image, previousPhotoshootOpt)
    _ <- newRightsUpsert(image, currentPhotoshootOpt, newRightsOpt)
  } yield ()

  private def newRightsUpsert(image: Image,
                              currentPhotoshootOpt: Option[Photoshoot],
                              newRightsOpt: Option[SyndicationRights]): Future[Unit] =
    newRightsOpt match {
      case Some(_) => for {
          _ <- Future.sequence(es.updateImageSyndicationRights(image.id, newRightsOpt))
          _ <- refreshCurrentPhotoshoot(image, currentPhotoshootOpt)
        } yield ()
      case None =>
        refreshCurrentPhotoshoot(image, currentPhotoshootOpt)
    }

  private def refreshPreviousPhotoshoot(image: Image, previousPhotoshootOpt: Option[Photoshoot]): Future[Unit] =
    previousPhotoshootOpt match {
      case Some(photoshoot) => refreshPhotoshoot(image, photoshoot, Some(image.id))
      case None => Future.successful(())
    }

  private def refreshCurrentPhotoshoot(image: Image, currentPhotoshootOpt: Option[Photoshoot]): Future[Unit] =
    currentPhotoshootOpt match {
      case Some(photoshoot) => refreshPhotoshoot(image, photoshoot)
      case None =>
        if (image.syndicationRights.forall(_.isInferred == true)) Future.sequence(es.deleteSyndicationRights(image.id)).map(_ => ())
        else Future.successful(())
    }

  private def refreshPhotoshoot(image: Image, photoshoot: Photoshoot, excludedImageId: Option[String] = None): Future[Unit] = for {
    latestRights <- getLatestSyndicationRights(image, photoshoot, excludedImageId)
    inferredImages <- getInferredSyndicationRightsImages(image, photoshoot, excludedImageId)
  } yield {
    GridLogger.info(s"Using rights $latestRights to infer rights for images: ${inferredImages.map(_.id)}")
    inferredImages.foreach(img => es.updateImageSyndicationRights(img.id, latestRights.map(_.copy(isInferred = true))))
  }

  // The following methods are needed because ES is not read write consistent
  private def getLatestSyndicationRights(image: Image, photoshoot: Photoshoot, excludedImageId: Option[String] = None): Future[Option[SyndicationRights]] = excludedImageId match {
    case Some(_) => es.getLatestSyndicationRights(photoshoot, excludedImageId).map(_.flatMap(_.syndicationRights))
    case None => es.getLatestSyndicationRights(photoshoot).map {
        case Some(dbImage) => if(!isInferred(image)) mostRecentSyndicationRights(dbImage, image) else dbImage.syndicationRights
        case None => if(!isInferred(image)) image.syndicationRights else None
      }
  }

  private def mostRecentSyndicationRights(image1: Image, image2: Image): Option[SyndicationRights] = (image1.syndicationRights.flatMap(_.published), image2.syndicationRights.flatMap(_.published)) match {
    case (Some(date1), Some(date2)) => if(date1.isAfter(date2)) image1.syndicationRights else image2.syndicationRights
    case (Some(_), None) => image1.syndicationRights
    case (None, Some(_)) => image2.syndicationRights
    case (None, None) => None
  }

  private def getInferredSyndicationRightsImages(image: Image, photoshoot: Photoshoot, excludedImageId: Option[String] = None): Future[List[Image]] = excludedImageId match {
    case Some(_) => es.getInferredSyndicationRightsImages(photoshoot, excludedImageId)
    case None => es.getInferredSyndicationRightsImages(photoshoot).map { images =>
      if(isInferred(image)) images :+ image else images
    }
  }

  private def isInferred(image: Image): Boolean = image.syndicationRights.forall(_.isInferred == true)
}
