package lib.kinesis

import com.gu.mediaservice.lib.aws.EsResponse
import com.gu.mediaservice.lib.elasticsearch.{ElasticNotFoundException, InProgress}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, combineMarkers}
import com.gu.mediaservice.model.usage.{Usage, UsageNotice}
// import all except `Right`, which otherwise shadows the type used in `Either`s
import com.gu.mediaservice.model.{Right => _, _}
import com.gu.mediaservice.syntax.MessageSubjects
import lib._
import lib.elasticsearch._
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

sealed trait MigrationFailure

case class ProjectionFailure(message: String) extends Exception(message) with MigrationFailure
case class GetVersionFailure(message: String) extends Exception(message) with MigrationFailure
case class VersionComparisonFailure(message: String) extends Exception(message) with MigrationFailure
case class InsertImageFailure(message: String) extends Exception(message) with MigrationFailure

class MessageProcessor(
  es: ElasticSearch,
  store: ThrallStore,
  metadataEditorNotifications: MetadataEditorNotifications,
) extends GridLogging with MessageSubjects {

  def process(updateMessage: ThrallMessage, logMarker: LogMarker)(implicit ec: ExecutionContext): Future[Any] = {
    updateMessage match {
      case message: ImageMessage => indexImage(message, logMarker)
      case message: DeleteImageMessage => deleteImage(message, logMarker)
      case message: SoftDeleteImageMessage => softDeleteImage(message, logMarker)
      case message: DeleteImageExportsMessage => deleteImageExports(message, logMarker)
      case message: UpdateImageExportsMessage => updateImageExports(message, logMarker)
      case message: UpdateImageUserMetadataMessage => updateImageUserMetadata(message, logMarker)
      case message: UpdateImageUsagesMessage => updateImageUsages(message, logMarker)
      case message: ReplaceImageLeasesMessage => replaceImageLeases(message, logMarker)
      case message: AddImageLeaseMessage => addImageLease(message, logMarker)
      case message: RemoveImageLeaseMessage => removeImageLease(message, logMarker)
      case message: SetImageCollectionsMessage => setImageCollections(message, logMarker)
      case message: DeleteUsagesMessage => deleteAllUsages(message, logMarker)
      case message: UpdateImageSyndicationMetadataMessage => upsertSyndicationRightsOnly(message, logMarker)
      case message: UpdateImagePhotoshootMetadataMessage => updateImagePhotoshoot(message, logMarker)
      case message: CreateMigrationIndexMessage => createMigrationIndex(message, logMarker)
      case message: MigrateImageMessage => migrateImage(message, logMarker)
    }
  }

  def updateImageUsages(message: UpdateImageUsagesMessage, logMarker: LogMarker)(implicit ec: ExecutionContext): Future[List[ElasticSearchUpdateResponse]] = {
    implicit val unw: OWrites[UsageNotice] = Json.writes[UsageNotice]
    implicit val lm: LogMarker = combineMarkers(message, logMarker)
    val usages = message.usageNotice.usageJson.as[Seq[Usage]]
    Future.traverse(es.updateImageUsages(message.id, usages, message.lastModified))(_.recoverWith {
      case ElasticNotFoundException => Future.successful(ElasticSearchUpdateResponse())
    })
  }

  private def indexImage(message: ImageMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    Future.sequence(
      es.indexImage(message.id, message.image, message.lastModified)(ec, logMarker)
    )

  private def migrateImage(message: MigrateImageMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) = {
    implicit val implicitLogMarker: LogMarker = logMarker
    val maybeStart = message.maybeImageWithVersion match {
      case Left(errorMessage) =>
        Future.failed(ProjectionFailure(errorMessage))
      case Right((image, expectedVersion)) => Future.successful((image, expectedVersion))
    }
    maybeStart.flatMap {
      case (image, expectedVersion) => es.getImageVersion(message.id).transformWith {
        case Success(Some(currentVersion)) => Future.successful((image, expectedVersion, currentVersion))
        case Success(None) => Future.failed(GetVersionFailure(s"No version found for image id: ${image.id}"))
        case Failure(exception) => Future.failed(GetVersionFailure(exception.toString))
      }
    }.flatMap {
      case (image, expectedVersion, currentVersion) => if (expectedVersion == currentVersion) {
        Future.successful(image)
      } else {
        Future.failed(VersionComparisonFailure(s"Version comparison failed for image id: ${image.id}"))
      }
    }.flatMap(
      image => Future.sequence(es.bulkInsert(Seq(image), es.imagesMigrationAlias)).transform {
        case s@Success(_) => s
        case Failure(exception) => Failure(InsertImageFailure(exception.toString))
      }
    ).flatMap { insertResult =>
      logger.info(s"Successfully migrated image with id: ${message.id}, setting 'migratedTo' on current index")
      es.setMigrationInfo(imageId = message.id, migrationInfo = Right(MigrationTo(migratedTo = insertResult.head.indexNames.head)))
    }.recoverWith {
      case failure: MigrationFailure =>
        logger.error(failure.getMessage)
        val migrationIndexName = es.migrationStatus match {
          case InProgress(migrationIndexName) => migrationIndexName
          case _ => "Unknown migration index name"
        }
        es.setMigrationInfo(imageId = message.id, migrationInfo = Left(MigrationFailure(failures = Map(migrationIndexName -> failure.getMessage))))
    }
  }

  private def updateImageExports(message: UpdateImageExportsMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    Future.sequence(
      es.updateImageExports(message.id, message.crops, message.lastModified)(ec, logMarker))

  private def deleteImageExports(message: DeleteImageExportsMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    Future.sequence(
      es.deleteImageExports(message.id, message.lastModified)(ec, logMarker))

  private def softDeleteImage(message: SoftDeleteImageMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    Future.sequence(es.applySoftDelete(message.id, message.softDeletedMetadata, message.lastModified)(ec, logMarker))

  private def updateImageUserMetadata(message: UpdateImageUserMetadataMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    Future.sequence(es.applyImageMetadataOverride(message.id, message.edits, message.lastModified)(ec, logMarker))

  private def replaceImageLeases(message: ReplaceImageLeasesMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    Future.sequence(es.replaceImageLeases(message.id, message.leases, message.lastModified)(ec, logMarker))

  private def addImageLease(message: AddImageLeaseMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    Future.sequence(es.addImageLease(message.id, message.lease, message.lastModified)(ec, logMarker))

  private def removeImageLease(message: RemoveImageLeaseMessage, logMarker: LogMarker)(implicit ec: ExecutionContext): Future[List[ElasticSearchUpdateResponse]] =
    Future.sequence(es.removeImageLease(message.id, Some(message.leaseId), message.lastModified)(ec, logMarker))

  private def setImageCollections(message: SetImageCollectionsMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    Future.sequence(es.setImageCollections(message.id, message.collections, message.lastModified)(ec, logMarker))

  private def deleteImage(message: DeleteImageMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) = {
    Future.sequence({
      implicit val marker: LogMarker = logMarker ++ logger.imageIdMarker(ImageId(message.id))
      // if we cannot delete the image as it's "protected", succeed and delete
      // the message anyway.
      logger.info(marker, "ES6 Deleting image: " + message.id)
      es.deleteImage(message.id).map { requests =>
        requests.map {
          _: ElasticSearchDeleteResponse =>
            store.deleteOriginal(message.id)
            store.deleteThumbnail(message.id)
            store.deletePng(message.id)
            metadataEditorNotifications.publishImageDeletion(message.id)
            EsResponse(s"Image deleted: ${message.id}")
        } recoverWith {
          case ImageNotDeletable =>
            logger.info(marker, "Could not delete image")
            Future.successful(EsResponse(s"Image cannot be deleted: ${message.id}"))
        }
      }
    })


  }

  private def deleteAllUsages(message: DeleteUsagesMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    Future.sequence(es.deleteAllImageUsages(message.id, message.lastModified)(ec, logMarker))

  def upsertSyndicationRightsOnly(message: UpdateImageSyndicationMetadataMessage, logMarker: LogMarker)(implicit ec: ExecutionContext): Future[Any] = {
    implicit val marker: LogMarker = logMarker ++ logger.imageIdMarker(ImageId(message.id))
    es.getImage(message.id) map {
      case Some(image) =>
        val photoshoot = image.userMetadata.flatMap(_.photoshoot)
        logger.info(marker, s"Upserting syndication rights for image ${message.id} in photoshoot $photoshoot with rights ${Json.toJson(message.maybeSyndicationRights)}")
        es.updateImageSyndicationRights(message.id, message.maybeSyndicationRights, message.lastModified)
      case _ => logger.info(marker, s"Image ${message.id} not found")
    }
  }

  def updateImagePhotoshoot(message: UpdateImagePhotoshootMetadataMessage, logMarker: LogMarker)(implicit ec: ExecutionContext): Future[Unit] = {
    implicit val marker: LogMarker = logMarker ++ logger.imageIdMarker(ImageId(message.id))
    for {
      imageOpt <- es.getImage(message.id)
      prevPhotoshootOpt = imageOpt.flatMap(_.userMetadata.flatMap(_.photoshoot))
      _ <- updateImageUserMetadata(UpdateImageUserMetadataMessage(message.id, message.lastModified, message.edits), logMarker)
    } yield logger.info(marker, s"Moved image ${message.id} from $prevPhotoshootOpt to ${message.edits.photoshoot}")
  }

  def createMigrationIndex(message: CreateMigrationIndexMessage, logMarker: LogMarker)(implicit ec: ExecutionContext): Future[Unit] = {
    Future {
      es.startMigration(message.newIndexName)(logMarker)
    }
  }
}
