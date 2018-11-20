package lib

import java.net.URI
import java.util.UUID

import com.gu.mediaservice.model._
import com.gu.mediaservice.model.usage._
import com.gu.mediaservice.model.usage.{UsageStatus => Status}
import com.gu.mediaservice.syntax._
import lib.elasticsearch.{ElasticSearch, SearchFilters}
import org.joda.time.DateTime
import org.scalatest.mockito.MockitoSugar
import play.api.Configuration
import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

trait ElasticSearchHelper extends MockitoSugar {
  private val mediaApiConfig = new MediaApiConfig() {
    override lazy val persistenceIdentifier = "test"
  }

  private val mediaApiMetrics = new MediaApiMetrics(mediaApiConfig)
  private val searchFilters = new SearchFilters(mediaApiConfig)
  val ES = new ElasticSearch(mediaApiConfig, searchFilters, mediaApiMetrics) {
    override lazy val port = 9301
    override lazy val cluster = "media-service-test"
    override lazy val imagesAlias = "media-service-test"
  }

  val testUser = "yellow-giraffe@theguardian.com"

  def createImage(
                   id: String,
                   usageRights: UsageRights,
                   syndicationRights: Option[SyndicationRights] = None,
                   leases: Option[LeasesByMedia] = None,
                   usages: List[Usage] = Nil
  ): Image = {
    Image(
      id = id,
      uploadTime = DateTime.now(),
      uploadedBy = testUser,
      lastModified = None,
      identifiers = Map.empty,
      uploadInfo = UploadInfo(filename = Some(s"test_$id.jpeg")),
      source = Asset(
        file = new URI(s"http://file/$id"),
        size = Some(292265L),
        mimeType = Some("image/jpeg"),
        dimensions = Some(Dimensions(width = 2800, height = 1600)),
        secureUrl = None),
      thumbnail = Some(Asset(
        file = new URI(s"http://file/thumbnail/$id"),
        size = Some(292265L),
        mimeType = Some("image/jpeg"),
        dimensions = Some(Dimensions(width = 800, height = 100)),
        secureUrl = None)),
      optimisedPng = None,
      fileMetadata = FileMetadata(),
      userMetadata = None,
      metadata = ImageMetadata(dateTaken = None, title = Some(s"Test image $id"), keywords = List("test", "es")),
      originalMetadata = ImageMetadata(),
      usageRights = usageRights,
      originalUsageRights = usageRights,
      exports = Nil,
      syndicationRights = syndicationRights,
      leases = leases.getOrElse(LeasesByMedia.build(Nil)),
      usages = usages
    )
  }

  def createImageForSyndication(
    id: String,
    rightsAcquired: Boolean,
    rcsPublishDate: Option[DateTime],
    lease: Option[MediaLease],
    usages: List[Usage] = Nil
  ): Image = {
    val rights = List(
      Right("test", Some(rightsAcquired), Nil)
    )

    val syndicationRights = SyndicationRights(rcsPublishDate, Nil, rights)

    val leaseByMedia = lease.map(l => LeasesByMedia(
      lastModified = None,
      leases = List(l)
    ))

    createImage(id, StaffPhotographer("Tom Jenkins", "The Guardian"), Some(syndicationRights), leaseByMedia, usages)
  }

  def createSyndicationLease(allowed: Boolean, imageId: String, startDate: Option[DateTime] = None, endDate: Option[DateTime] = None): MediaLease = {
    MediaLease(
      id = None,
      leasedBy = None,
      startDate = startDate,
      endDate = endDate,
      access = if (allowed) AllowSyndicationLease else DenySyndicationLease,
      notes = None,
      mediaId = imageId
    )
  }

  def createSyndicationUsage(): Usage = {
    createUsage(SyndicationUsageReference, SyndicationUsage, SyndicatedUsageStatus)
  }

  def createDigitalUsage(): Usage = {
    createUsage(ComposerUsageReference, DigitalUsage, PublishedUsageStatus)
  }

  private def createUsage(t: UsageReferenceType, usageType: UsageType, status: Status): Usage = {
    Usage(
      UUID.randomUUID().toString,
      List(UsageReference(t)),
      usageType,
      "image",
      status,
      Some(DateTime.now()),
      None,
      DateTime.now()
    )
  }

  def saveImages(images: List[Image]) = {
    Future.sequence(
      images.map(image => {
        ES.client.prepareIndex("images", "image")
          .setId(image.id)
          .setSource(Json.toJson(image).toString())
          .executeAndLog(s"Saving test image with id ${image.id}")
      })
    )
  }

  def deleteImages() = {
    ES.client.prepareDelete().setIndex("images").executeAndLog(s"Deleting index")
  }
}
