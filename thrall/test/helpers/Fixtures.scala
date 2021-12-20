package helpers

import java.net.URI
import java.util.UUID

import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.{LeasesByMedia, MediaLease}
import com.gu.mediaservice.model.usage.{DigitalUsage, PublishedUsageStatus, Usage}
import org.joda.time.{DateTime, DateTimeZone}

trait Fixtures {

  def createImage(
                   id: String,
                   usageRights: UsageRights,
                   syndicationRights: Option[SyndicationRights] = None,
                   leases: Option[LeasesByMedia] = None,
                   usages: List[Usage] = Nil,
                   optPhotoshoot: Option[Photoshoot] = None,
                   fileMetadata: Option[FileMetadata] = None
                 ): Image =
    Image(
     id = id,
     uploadTime = now,
     uploadedBy = "yellow.giraffe@theguardian.com",
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
                                 usages: List[Usage] = Nil,
                                 fileMetadata: Option[FileMetadata] = None,
                                 leasesLastModified: Option[DateTime] = None
                               ): Image = {
    val rights = List(
      Right("test", Some(rightsAcquired), Nil)
    )

    val syndicationRights = SyndicationRights(rcsPublishDate, Nil, rights)

    val leaseByMedia = lease.map(l => LeasesByMedia.build(List(l)))

    createImage(id, StaffPhotographer("Tom Jenkins", "The Guardian"), Some(syndicationRights), leaseByMedia, usages, fileMetadata = fileMetadata)
  }

  private def now = DateTime.now(DateTimeZone.UTC)

  def someSyndRights = Some(SyndicationRights(
    published = Some(now),
    suppliers = List(Supplier(supplierName = Some("supplier"), supplierId = Some("supplier-id"), prAgreement = Some(true))),
    rights = List(Right(rightCode = "code", acquired = Some(true), properties = Seq.empty)),
    isInferred = false))

  def imageWithNoSyndRights: Image = createImage(id = UUID.randomUUID().toString, usageRights = StaffPhotographer("Tom Jenkins", "The Guardian"))
  def imageWithSyndRights: Image = createImage(id = UUID.randomUUID().toString, usageRights = StaffPhotographer("Tom Jenkins", "The Guardian"), syndicationRights = someSyndRights)

  def imageWithPhotoshoot(photoshoot: Photoshoot): Image = createImage(id = UUID.randomUUID().toString, StaffPhotographer("Tom Jenkins", "The Guardian"), optPhotoshoot = Some(photoshoot))

  def crop = {
    val cropSpec = CropSpec("/test", Bounds(0,0,0,0), None)
    Crop(None, None, None, cropSpec: CropSpec, None, List.empty)
  }

  def usage(id: String = UUID.randomUUID().toString) = Usage(id, List.empty, DigitalUsage, "test", PublishedUsageStatus,  None, None, now)

  def stringLongerThan(i: Int): String = {
    var out = ""
    while (out.trim.length < i) {
      out = out + UUID.randomUUID().toString + " "
    }
    out
  }

}
