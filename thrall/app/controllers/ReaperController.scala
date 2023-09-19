package controllers

import com.gu.mediaservice.lib.ImageIngestOperations
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.Permissions.DeleteImage
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.lib.elasticsearch.ReapableEligibility
import com.gu.mediaservice.lib.logging.{GridLogging, MarkerMap}
import com.gu.mediaservice.lib.metadata.SoftDeletedMetadataTable
import com.gu.mediaservice.model.{ImageStatusRecord, SoftDeletedMetadata}
import lib.ThrallStore
import lib.elasticsearch.ElasticSearch
import org.joda.time.{DateTime, DateTimeZone}
import play.api.libs.json.Json
import play.api.mvc.{ControllerComponents, Result}

import scala.concurrent.{ExecutionContext, Future}
import scala.language.postfixOps

class ReaperController(
  es: ElasticSearch,
  store: ThrallStore,
  authorisation: Authorisation,
  persistedRootCollections: List[String],
  persistenceIdentifier: String,
  softDeletedMetadataTable: SoftDeletedMetadataTable,
  override val auth: Authentication,
  override val services: Services,
  override val controllerComponents: ControllerComponents,
)(implicit val ec: ExecutionContext) extends BaseControllerWithLoginRedirects with GridLogging {

  private def batchDeleteWrapper(count: Int)(func: (Principal, ReapableEligibility) => Future[Result]) = auth.async { request =>
    if (!authorisation.hasPermissionTo(DeleteImage)(request.user)) {
      Future.successful(Forbidden)
    }
    else if (count > 1000) {
      Future.successful(BadRequest("Too many IDs. Maximum 1000."))
    }
    else {
      val isReapable = new ReapableEligibility {
        override val persistedRootCollections: List[String] = ReaperController.this.persistedRootCollections
        override val persistenceIdentifier: String = ReaperController.this.persistenceIdentifier
      }
      func(
        request.user,
        isReapable
      )
    }
  }

  def doBatchSoftReap(count: Int) = batchDeleteWrapper(count){ (user, isReapable) => Future {

    implicit val logMarker: MarkerMap = MarkerMap()

    logger.info(s"Soft deleting next $count images...")

    val deleteTime = DateTime.now(DateTimeZone.UTC)
    val deletedBy = user.accessor.identity

    val results = for {
      idsSoftDeletedInES: Set[String] <- es.softDeleteNextBatchOfImages(isReapable, count, SoftDeletedMetadata(deleteTime, deletedBy))
      // TODO add some logging that no IDs needed deleting (might already happen inside ES function)
      if idsSoftDeletedInES.nonEmpty
      dynamoStatuses <- softDeletedMetadataTable.setStatuses(idsSoftDeletedInES.map(
        ImageStatusRecord(
          _,
          deletedBy = user.accessor.identity,
          deleteTime = deleteTime.toString,
          isDeleted = true
        )
      ))
    } yield idsSoftDeletedInES //TODO do something with the dynamoStatuses and log per ID

    val resultsJson = results.map(Json.toJson(_))

    // FIXME write permanent log to S3

    resultsJson.map(Ok(_))
  }.flatten}


  def doBatchHardReap(count: Int) = batchDeleteWrapper(count){ (_, isReapable) => Future {

    implicit val logMarker: MarkerMap = MarkerMap()

    logger.info(s"Hard deleting next $count images...")

    val results = for {
      idsHardDeletedFromES: Set[String] <- es.hardDeleteNextBatchOfImages(isReapable, count)
      // TODO add some logging that no IDs needed deleting (might already happen inside ES function)
      if idsHardDeletedFromES.nonEmpty
      mainImagesS3Deletions <- store.deleteOriginals(idsHardDeletedFromES)
      thumbsS3Deletions <- store.deleteThumbnails(idsHardDeletedFromES)
      pngsS3Deletions <- store.deletePNGs(idsHardDeletedFromES)
    } yield idsHardDeletedFromES.map { id =>
      // TODO log per ID
      id -> Map(
        "ES" -> Some(true), // since this is list of IDs deleted from ES
        "mainImage" -> mainImagesS3Deletions.get(ImageIngestOperations.fileKeyFromId(id)),
        "thumb" -> thumbsS3Deletions.get(ImageIngestOperations.fileKeyFromId(id)),
        "optimisedPng" -> pngsS3Deletions.get(ImageIngestOperations.optimisedPngKeyFromId(id))
      )
    }.toMap

    val resultsJson = results.map(Json.toJson(_))

    // FIXME write permanent log to S3

    resultsJson.map(Ok(_))

  }.flatten}

}
