package helpers

import java.net.URI
import java.util.UUID

import com.gu.mediaservice.model._
import com.gu.mediaservice.model.usage.Usage
import lib.{ElasticSearch, ThrallConfig, ThrallMetrics}
import org.joda.time.DateTime
import play.api.Configuration

trait ElasticsearchHelpers {
  private val thrallConfig = new ThrallConfig()
  private val thrallMetrics = new ThrallMetrics(thrallConfig)

  val ES: ElasticSearch = new ElasticSearch(thrallConfig, thrallMetrics) {
    override lazy val port = 9301
    override lazy val cluster = "media-service-test"
    override lazy val imagesAlias = "media-service-test"
  }

  def createImage(
                   id: String,
                   usageRights: UsageRights,
                   syndicationRights: Option[SyndicationRights] = None,
                   leases: Option[LeasesByMedia] = None,
                   usages: List[Usage] = Nil,
                   optPhotoshoot: Option[Photoshoot] = None
                 ): Image =
    Image(
     id = id,
     uploadTime = DateTime.now(),
     uploadedBy = "yellow.giraffe@theguardian.com",
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
     userMetadata = optPhotoshoot.map(_ => Edits(metadata = ImageMetadata(), photoshoot = optPhotoshoot)),
     metadata = ImageMetadata(dateTaken = None, title = Some(s"Test image $id"), keywords = List("test", "es")),
     originalMetadata = ImageMetadata(),
     usageRights = usageRights,
     originalUsageRights = usageRights,
     exports = Nil,
     syndicationRights = syndicationRights,
     leases = leases.getOrElse(LeasesByMedia.build(Nil)),
     usages = usages
   )

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

  def someSyndRights = Some(SyndicationRights(
    published = Some(DateTime.now()),
    suppliers = List(Supplier(supplierName = Some("supplier"), supplierId = Some("supplier-id"), prAgreement = Some(true))),
    rights = List(Right(rightCode = "code", acquired = Some(true), properties = Seq.empty)),
    isInferred = false))

  def imageWithNoSyndRights: Image = createImage(id = UUID.randomUUID().toString, usageRights = StaffPhotographer("Tom Jenkins", "The Guardian"))
  def imageWithSyndRights: Image = createImage(id = UUID.randomUUID().toString, usageRights = StaffPhotographer("Tom Jenkins", "The Guardian"), syndicationRights = someSyndRights)

  def imageWithPhotoshoot(photoshoot: Photoshoot): Image = createImage(id = UUID.randomUUID().toString, StaffPhotographer("Tom Jenkins", "The Guardian"), optPhotoshoot = Some(photoshoot))
}
