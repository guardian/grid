package com.gu.mediaservice

import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model._
import org.joda.time.DateTime
import play.api.libs.ws.WSRequest
import play.api.mvc.RequestHeader

import scala.concurrent.{ExecutionContext, Future}

object ImageDataMerger extends GridLogging {
  def aggregate(image: Image, gridClient: GridClient, authFunction: WSRequest => WSRequest)(implicit ec: ExecutionContext, logMarker: LogMarker, instance: Instance): Future[Image] = {
    logger.info(logMarker, s"starting to aggregate image")
    val mediaId = image.id
    // NB original metadata should already be added, cleaned, and copied to metadata.

    // Start these futures outside of the for-comprehension to allow them to run in parallel
    val collectionsF = gridClient.getCollections(mediaId, authFunction)
    val editsF = gridClient.getEdits(mediaId, authFunction)
    val imageStatusF = gridClient.getSoftDeletedMetadata(mediaId, authFunction)
    val leasesF = gridClient.getLeases(mediaId, authFunction)
    val usagesF = gridClient.getUsages(mediaId, authFunction)
    val cropsF = gridClient.getCrops(mediaId, authFunction)
    val syndicationRightsF = gridClient.getSyndicationRights(mediaId, authFunction)
    for {
      collections <- collectionsF
      edits <- editsF
      softDeletedMetadata <- imageStatusF
      leases <- leasesF
      usages <- usagesF
      crops <- cropsF
      syndicationRights <- syndicationRightsF
    } yield {
      val updatedImage = image.copy(
        softDeletedMetadata = softDeletedMetadata.flatMap(meta => meta.isDeleted match {
          case true => Some(SoftDeletedMetadata(DateTime.parse(meta.deleteTime), meta.deletedBy))
          case false => None
        }),
        collections = collections,
        userMetadata = edits,
        leases = leases,
        usages = usages,
        exports = crops,
        metadata = ImageDataMerger.mergeMetadata(edits, image.metadata),
        usageRights = edits.flatMap(e => e.usageRights).getOrElse(image.usageRights),
        syndicationRights = syndicationRights
      )
      val inferredLastModified = ImageDataMerger.inferLastModifiedDate(updatedImage)
      updatedImage.copy(
        // userMetadataLastModified is that from edits, falling back to the inferred
        userMetadataLastModified = edits.flatMap(_.lastModified).orElse(inferredLastModified),
        // main last modified is always inferred
        lastModified = inferredLastModified
      )
    }
  }

  /** This is the highest last modified of any date we know in the image */
  def inferLastModifiedDate(image: Image): Option[DateTime] = {
    val dtOrdering = Ordering.by((_: DateTime).getMillis())

    val exportsDates = image.exports.flatMap(_.date)
    val collectionsDates = image.collections.map(_.actionData.date)
    val usagesDates = image.usages.map(_.lastModified)
    val metadataEditDate = image.userMetadata.flatMap(_.lastModified)

    val allDatesForUserEditableFields = image.leases.lastModified ++
      exportsDates ++
      collectionsDates ++
      usagesDates ++
      metadataEditDate

    allDatesForUserEditableFields match {
      case Nil => None
      case dates => Some(dates.max(dtOrdering))
    }
  }

  private def mergeMetadata(edits: Option[Edits], originalMetadata: ImageMetadata) = edits match {
    case Some(Edits(_, _, metadata, _, _, _)) => originalMetadata.merge(metadata)
    case None => originalMetadata
  }
}
