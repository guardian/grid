package lib

import java.net.URI
import com.gu.mediaservice.model._
import lib.usagerights.CostCalculator
import org.joda.time.DateTime
import org.scalatest.{FunSpec, Matchers}
import org.scalatestplus.mockito.MockitoSugar

class ImageExtrasTest extends FunSpec with Matchers with MockitoSugar {

  val Quota = mock[UsageQuota]

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
    "paid_image" -> ValidityCheck(invalid = true,overrideable = true,shouldOverride = false),
    "missing_description" -> ValidityCheck(invalid = true,overrideable = false,shouldOverride = false),
    "missing_credit" -> ValidityCheck(invalid = true,overrideable = false,shouldOverride = false),
    "over_quota" -> ValidityCheck(invalid = false,overrideable = true,shouldOverride = false),
    "current_deny_lease" -> ValidityCheck(invalid = false,overrideable = true,shouldOverride = false),
    "no_rights" -> ValidityCheck(invalid = true,overrideable = true,shouldOverride = false),
    "conditional_paid" -> ValidityCheck(invalid = false,overrideable = true,shouldOverride = false)
  )

  describe("Invalid Images") {
    it("should generate validityMaps") {
      baseValidityMap should be(ImageExtras.validityMap(baseImage, withWritePermission = false))
    }
    it("should report validity") {
      val validityMap  = ImageExtras.validityMap(baseImage, withWritePermission = false)
      val validity = ImageExtras.isValid(validityMap)

      validity should be(false)
    }
    it("should report overriden validity") {
      val overrideableImage = baseImage.copy(metadata = validImageMetadata)
      val validityMap  = ImageExtras.validityMap(overrideableImage, withWritePermission = true)
      val validity = ImageExtras.isValid(validityMap)

      validity should be(true)
    }
    it("should report invalid when fields cannot be overriden") {
      val validityMap  = ImageExtras.validityMap(baseImage, withWritePermission = true)
      val validity = ImageExtras.isValid(validityMap)

      validity should be(false)
    }
    it("should report all invalid reasons") {
      val validityMap  = ImageExtras.validityMap(baseImage, withWritePermission = false)
      val invalidReasons = ImageExtras.invalidReasons(validityMap)
      val expectedInvalidReasons = Map(
        "paid_image" -> "Paid imagery requires a lease",
        "missing_description" -> "Missing description *",
        "missing_credit" -> "Missing credit information *",
        "no_rights" -> "No rights to use this image"
      )

      expectedInvalidReasons should be(invalidReasons)
    }

    it("should report all invalid reasons if write permissions are true") {
      val validityMap  = ImageExtras.validityMap(baseImage, withWritePermission = true)
      val invalidReasons = ImageExtras.invalidReasons(validityMap)
      val expectedInvalidReasons = Map(
        "missing_description" -> "Missing description *",
        "missing_credit" -> "Missing credit information *"
      )

      expectedInvalidReasons should be(invalidReasons)
    }
  }
}
