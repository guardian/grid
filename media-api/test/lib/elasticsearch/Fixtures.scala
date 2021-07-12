package lib.elasticsearch

import java.net.URI
import java.util.UUID

import com.gu.mediaservice.model.leases.{AllowSyndicationLease, DenySyndicationLease, LeasesByMedia, MediaLease}
import com.gu.mediaservice.model.usage.{UsageStatus => Status, _}
import com.gu.mediaservice.model.{StaffPhotographer, _}
import org.joda.time.DateTime

trait Fixtures {

  val testUser = "yellow-giraffe@theguardian.com"
  val staffPhotographer = StaffPhotographer("Tom Jenkins", "The Guardian")
  val agency = Agency("ACME")
  val screengrab = Screengrab(None, None)
  val USED_CONFIGS_IN_TEST = Map(
    "es6.shards" -> 0,
    "es6.replicas" -> 0,
    "field.aliases" -> Seq.empty,
    "usageRights" -> Map(
      "applicable" -> List()
    ),
    "usageRightsConfigProvider" -> "com.gu.mediaservice.lib.config.RuntimeUsageRightsConfig"
  )
  val NOT_USED_IN_TEST = "not used in test"
  val MOCK_CONFIG_KEYS = Seq(
    "auth.keystore.bucket",
    "persistence.identifier",
    "thrall.kinesis.stream.name",
    "thrall.kinesis.lowPriorityStream.name",
    "domain.root",
    "s3.config.bucket",
    "s3.usagemail.bucket",
    "quota.store.key",
    "es.index.aliases.current",
    "es.index.aliases.migration",
    "es6.url",
    "es6.cluster",
    "s3.image.bucket",
    "s3.thumb.bucket",
    "grid.stage",
    "grid.appName"
  )

  def createImage(
    id: String,
    usageRights: UsageRights,
    syndicationRights: Option[SyndicationRights] = None,
    leases: Option[LeasesByMedia] = None,
    usages: List[Usage] = Nil,
    fileMetadata: Option[FileMetadata] = None
  ): Image = {
    Image(
      id = id,
      uploadTime = DateTime.now(),
      uploadedBy = testUser,
      softDeletedMetadata = None,
      lastModified = None,
      identifiers = Map.empty,
      uploadInfo = UploadInfo(filename = Some(s"test_$id.jpeg")),
      source = Asset(
        file = new URI(s"http://file/$id"),
        size = Some(292265L),
        mimeType = Some(Jpeg),
        dimensions = Some(Dimensions(width = 2800, height = 1600)),
        secureUrl = None),
      thumbnail = Some(Asset(
        file = new URI(s"http://file/thumbnail/$id"),
        size = Some(292265L),
        mimeType = Some(Jpeg),
        dimensions = Some(Dimensions(width = 800, height = 100)),
        secureUrl = None)),
      optimisedPng = None,
      fileMetadata = fileMetadata.getOrElse(FileMetadata()),
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

  def createImageUploadedInThePast(id: String): Image = createImage(id = id, Handout()).copy(
    uploadTime = DateTime.now.minusMonths(1)
  )

  def createImageForSyndication(
    id: String,
    rightsAcquired: Boolean,
    rcsPublishDate: Option[DateTime],
    lease: Option[MediaLease],
    usages: List[Usage] = Nil,
    usageRights: UsageRights = staffPhotographer,
    fileMetadata: Option[FileMetadata] = None
  ): Image = {
    val rights = List(
      Right("test", Some(rightsAcquired), Nil)
    )

    val syndicationRights = SyndicationRights(rcsPublishDate, Nil, rights)

    val leaseByMedia = lease.map(l => LeasesByMedia.build(List(l)))

    createImage(id, usageRights, Some(syndicationRights), leaseByMedia, usages, fileMetadata)
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

  def createSyndicationUsage(date: DateTime = DateTime.now): Usage = {
    createUsage(SyndicationUsageReference, SyndicationUsage, SyndicatedUsageStatus, date)
  }

  def createDigitalUsage(date: DateTime = DateTime.now): Usage = {
    createUsage(ComposerUsageReference, DigitalUsage, PublishedUsageStatus, date)
  }

  def createPrintUsage(date: DateTime = DateTime.now): Usage = createUsage(InDesignUsageReference, PrintUsage, PendingUsageStatus, date)

  def stringLongerThan(i: Int): String = {
    var out = ""
    while (out.trim.length < i) {
      out = out + UUID.randomUUID().toString + " "
    }
    out
  }

  private def createUsage(t: UsageReferenceType, usageType: UsageType, status: Status, date: DateTime): Usage = {
    Usage(
      UUID.randomUUID().toString,
      List(UsageReference(t)),
      usageType,
      "image",
      status,
      dateAdded = Some(date),
      None,
      lastModified = date
    )
  }

}
