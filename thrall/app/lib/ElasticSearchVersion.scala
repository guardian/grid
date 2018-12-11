package lib

import com.gu.mediaservice.model.{Image, Photoshoot, SyndicationRights}
import org.elasticsearch.action.delete.DeleteResponse
import org.elasticsearch.action.update.UpdateResponse
import play.api.libs.json.{JsLookupResult, JsValue}

import scala.concurrent.{ExecutionContext, Future}

trait ElasticSearchVersion {

  def indexImage(id: String, image: JsValue)(implicit ex: ExecutionContext): List[Future[UpdateResponse]]

  def deleteImage(id: String)(implicit ex: ExecutionContext): List[Future[DeleteResponse]]

  def updateImageUsages(id: String, usages: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]]

  def updateImageSyndicationRights(id: String, rights: Option[SyndicationRights])(implicit ex: ExecutionContext): List[Future[UpdateResponse]]

  def deleteAllImageUsages(id: String)(implicit ex: ExecutionContext): List[Future[UpdateResponse]]

  def deleteSyndicationRights(id: String)(implicit ex: ExecutionContext): List[Future[UpdateResponse]]

  def updateImageLeases(id: String, leaseByMedia: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]]

  def addImageLease(id: String, lease: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]]

  def removeImageLease(id: String, leaseId: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]]

  def updateImageExports(id: String, exports: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]]

  def deleteImageExports(id: String)(implicit ex: ExecutionContext): List[Future[UpdateResponse]]

  def applyImageMetadataOverride(id: String, metadata: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]]

  def setImageCollection(id: String, collections: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]]

  def getImage(id: String)(implicit ex: ExecutionContext): Future[Option[Image]]

  def getInferredSyndicationRightsImages(photoshoot: Photoshoot, excludedImageId: Option[String] = None)(implicit ex: ExecutionContext): Future[List[Image]]

  def getLatestSyndicationRights(photoshoot: Photoshoot, excludedImageId: Option[String] = None)(implicit ex: ExecutionContext): Future[Option[Image]]

  def ensureAliasAssigned()

}
