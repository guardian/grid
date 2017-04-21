package lib

import org.scalatest.{FunSpec, Matchers}
import com.gu.mediaservice.model._
import lib.usagerights.CostCalculator
import org.joda.time.DateTime

import java.net.URI

class ImageExtrasTest extends FunSpec with Matchers {
  object Quota extends UsageQuota {
    val usageStore = null
    val quotaStore = null
  }

  object Costing extends CostCalculator {
    val quotas = Quota
    override def getOverQuota(usageRights: UsageRights) = None
  }

  implicit val cost: CostCalculator = Costing
  implicit val quotas: UsageQuota = Quota

  val baseImage = Image(
    id = "id",
    uploadTime = new DateTime(),
    uploadedBy = "uploadedBy",
    lastModified = None,
    identifiers = Map(),
    uploadInfo = UploadInfo(),
    source = Asset(
      file = new URI("http://www.example.com"),
      size = None,
      mimeType = None,
      dimensions = None
    ),
    thumbnail = None,
    optimisedPng = None,
    fileMetadata = FileMetadata(),
    userMetadata = None,
    metadata = ImageMetadata(),
    originalMetadata = ImageMetadata(),
    usageRights = NoRights,
    originalUsageRights = NoRights
  )

  val validImageMetadata = ImageMetadata(
    credit = Some("credit"),
    description = Some("description")
  )

  val baseValidityMap = Map(
    "paid_image" -> ValidityCheck(true,true,false),
    "missing_description" -> ValidityCheck(true,false,false),
    "missing_credit" -> ValidityCheck(true,false,false),
    "over_quota" -> ValidityCheck(false,true,false),
    "current_deny_lease" -> ValidityCheck(false,true,false),
    "no_rights" -> ValidityCheck(true,true,false),
    "conditional_paid" -> ValidityCheck(false,true,false)
  )

  describe("Invalid Images") {
    it("should generate validityMaps") {
      baseValidityMap should be(ImageExtras.validityMap(baseImage, false))
    }
    it("should report validity") {
      val validityMap  = ImageExtras.validityMap(baseImage, false)
      val validity = ImageExtras.isValid(validityMap)

      validity should be(false)
    }
    it("should report overriden validity") {
      val overrideableImage = baseImage.copy(metadata = validImageMetadata)
      val validityMap  = ImageExtras.validityMap(overrideableImage, true)
      val validity = ImageExtras.isValid(validityMap)

      validity should be(true)
    }
    it("should report invalid when fields cannot be overriden") {
      val validityMap  = ImageExtras.validityMap(baseImage, true)
      val validity = ImageExtras.isValid(validityMap)

      validity should be(false)
    }
    it("should report all invalid reasons") {
      val validityMap  = ImageExtras.validityMap(baseImage, true)
      val invalidReasons = ImageExtras.invalidReasons(validityMap)
      val expectedInvalidReasons = Map(
        "paid_image" -> "Paid imagery requires a lease",
        "missing_description" -> "Missing description *",
        "missing_credit" -> "Missing credit information *",
        "no_rights" -> "No rights to use this image"
      )

      expectedInvalidReasons should be(invalidReasons)
    }
  }
}
