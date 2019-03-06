package lib

import com.gu.mediaservice.model.{Image, MediaLease, Photoshoot, SyndicationRights}
import play.api.libs.json.{JsLookupResult, JsValue}

import scala.concurrent.{ExecutionContext, Future}

trait ElasticSearchVersion {

  def indexImage(id: String, image: JsValue)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]]

  def deleteImage(id: String)(implicit ex: ExecutionContext): List[Future[ElasticSearchDeleteResponse]]

  def updateImageUsages(id: String, usages: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]]

  def updateImageSyndicationRights(id: String, rights: Option[SyndicationRights])(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]]

  def deleteAllImageUsages(id: String)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]]

  def deleteSyndicationRights(id: String)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]]

  def replaceImageLeases(id: String, leases: Seq[MediaLease])(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]]

  def addImageLease(id: String, lease: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]]

  def removeImageLease(id: String, leaseId: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]]

  def updateImageExports(id: String, exports: JsLookupResult)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]]

  def deleteImageExports(id: String)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]]

  def applyImageMetadataOverride(id: String, metadata: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]]

  def setImageCollection(id: String, collections: JsLookupResult)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]]

  def getImage(id: String)(implicit ex: ExecutionContext): Future[Option[Image]]

  def getInferredSyndicationRightsImages(photoshoot: Photoshoot, excludedImageId: Option[String] = None)(implicit ex: ExecutionContext): Future[List[Image]]

  def getLatestSyndicationRights(photoshoot: Photoshoot, excludedImageId: Option[String] = None)(implicit ex: ExecutionContext): Future[Option[Image]]

  def ensureAliasAssigned()

  def healthCheck()(implicit ex: ExecutionContext): Future[Boolean]

}
