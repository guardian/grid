package lib
import com.gu.mediaservice.model.{Image, MediaLease, Photoshoot, SyndicationRights}
import play.api.libs.json.{JsLookupResult, JsValue}

import scala.concurrent.{ExecutionContext, Future}

class ElasticSearchRouter(versions: Seq[ElasticSearchVersion]) extends ElasticSearchVersion {

  val primary = versions.head

  override def indexImage(id: String, image: JsValue)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]] = versions.map(_.indexImage(id, image)).head

  override def deleteImage(id: String)(implicit ex: ExecutionContext): List[Future[ElasticSearchDeleteResponse]] = versions.map(_.deleteImage(id)).head

  override def updateImageUsages(id: String, usages: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]] =
    versions.map(_.updateImageUsages(id, usages, lastModified)).head

  override def updateImageSyndicationRights(id: String, rights: Option[SyndicationRights])(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]] = {
    versions.map(_.updateImageSyndicationRights(id, rights)).head
  }

  override def deleteAllImageUsages(id: String)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]] = versions.map(_.deleteAllImageUsages(id)).head

  override def deleteSyndicationRights(id: String)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]] = versions.map(_.deleteSyndicationRights(id)).head

  override def replaceImageLeases(id: String, leases: Seq[MediaLease])(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]] =
    versions.map(_.replaceImageLeases(id, leases)).head

  override def addImageLease(id: String, lease: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]] =
    versions.map(_.addImageLease(id, lease, lastModified)).head

  override def removeImageLease(id: String, leaseId: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]] =
    versions.map(_.removeImageLease(id, leaseId, lastModified)).head

  override def updateImageExports(id: String, exports: JsLookupResult)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]] =
    versions.map(_.updateImageExports(id, exports)).head

  override def deleteImageExports(id: String)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]] = versions.map(_.deleteImageExports(id)).head

  override def applyImageMetadataOverride(id: String, metadata: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]] =
    versions.map(_.applyImageMetadataOverride(id, metadata, lastModified)).head

  override def setImageCollection(id: String, collections: JsLookupResult)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]] =
    versions.map(_.setImageCollection(id, collections)).head

  override def getImage(id: String)(implicit ex: ExecutionContext): Future[Option[Image]] = primary.getImage(id)

  override def getInferredSyndicationRightsImages(photoshoot: Photoshoot, excludedImageId: Option[String])(implicit ex: ExecutionContext): Future[List[Image]] =
    primary.getInferredSyndicationRightsImages(photoshoot, excludedImageId)

  override def getLatestSyndicationRights(photoshoot: Photoshoot, excludedImageId: Option[String])(implicit ex: ExecutionContext): Future[Option[Image]] =
    primary.getLatestSyndicationRights(photoshoot, excludedImageId)

  override def ensureAliasAssigned(): Unit = versions.map(_.ensureAliasAssigned())

  override def healthCheck()(implicit ex: ExecutionContext): Future[Boolean] = primary.healthCheck()

}
