package com.gu.mediaservice

import com.gu.mediaservice.lib.config.{ServiceHosts, Services}
import com.gu.mediaservice.model.Image

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}

object ImagesBatchProjection {
  def apply(apiKey: String, domainRoot: String, timeout: Duration): ImagesBatchProjection =
    new ImagesBatchProjection(apiKey, domainRoot, timeout)
}

class ImagesBatchProjection(apiKey: String, domainRoot: String, timeout: Duration) {

  private val ImageProjector = createImageProjector

  def getMaybeImagesProjectionBlobs(mediaIds: List[String])(implicit ec: ExecutionContext): List[Either[Image, String]] = {
    val f = Future.traverse(mediaIds) { id =>
      val maybeProjection = ImageProjector.getMergedImageData(id)

      val notFoundOrImage: Future[Either[Image, String]] = maybeProjection.map {
        case Some(img) => Left(img)
        case None => Right(id)
      }
      notFoundOrImage
    }
    Await.result(f, timeout)
  }

  private def createImageProjector = {
    val services = new Services(domainRoot, ServiceHosts.guardianPrefixes, Set.empty)
    val cfg = ImageDataMergerConfig(apiKey, services)
    if (!cfg.isValidApiKey()) throw new IllegalArgumentException("provided api_key is invalid")
    new ImageDataMerger(cfg)
  }

}


