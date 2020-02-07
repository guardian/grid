package com.gu.mediaservice

import com.gu.mediaservice.lib.config.{ServiceHosts, Services}
import play.api.libs.json.Json

import scala.concurrent.{ExecutionContext, Future}

object ImagesBatchProjection {
  def apply(apiKey: String, domainRoot: String): ImagesBatchProjection =
    new ImagesBatchProjection(apiKey, domainRoot)
}

case class ImageBlobEntry(id: String, blob: Option[String])

class ImagesBatchProjection(apiKey: String, domainRoot: String) {

  private def createImageProjector = {
    val services = new Services(domainRoot, ServiceHosts.guardianPrefixes, Set.empty)
    val cfg = ImageDataMergerConfig(apiKey, services)
    if (!cfg.isValidApiKey()) throw new IllegalArgumentException("provided api_key is invalid")
    new ImageDataMerger(cfg)
  }

  private val ImageProjector = createImageProjector

  def prepareImageItemsBlobs(mediaIds: List[String])(implicit ec: ExecutionContext) = {
    import Json.{stringify, toJson}
    Future.traverse(mediaIds) { id =>
      val maybeProjection = ImageProjector.getMergedImageData(id)
      maybeProjection.map(opt => (id, opt))
    }.map(_.map { case (id, maybeImg) => ImageBlobEntry(id, maybeImg.map(img => stringify(toJson(img)))) })
  }

}


