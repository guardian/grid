package lib

import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.Permissions.DeleteImage
import com.gu.mediaservice.lib.auth.provider.AuthorisationProvider
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation, SimplePermission}
import com.gu.mediaservice.lib.guardian.GuardianUsageRightsConfig
import com.gu.mediaservice.model._
import lib.elasticsearch.Fixtures
import lib.usagerights.CostCalculator
import org.joda.time.DateTime
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar

import java.net.URI
import scala.concurrent.ExecutionContext.global

class ImageExtrasTest extends AnyFunSpec with Matchers with MockitoSugar with Fixtures {

  private val Quota = mock[UsageQuota]

  object Costing extends CostCalculator {
    val quotas: UsageQuota = Quota

    override def isOverQuota(usageRights: UsageRights): Boolean = false
    override val freeSuppliers: List[String] = GuardianUsageRightsConfig.freeSuppliers
    override val suppliersCollectionExcl: Map[String, List[String]] = GuardianUsageRightsConfig.suppliersCollectionExcl
  }

  implicit val cost: CostCalculator = Costing
  implicit val quotas: UsageQuota = Quota

  private val baseImage = Image(
    id = "id",
    uploadTime = new DateTime(),
    uploadedBy = "uploadedBy",
    softDeletedMetadata = None,
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
    originalUsageRights = NoRights,
    embedding = None,
  )

  private  val validImageMetadata = ImageMetadata(
    credit = Some("credit"),
    description = Some("description")
  )

  private val baseMappings = Map(
    "paid_image" -> ValidityCheck(invalid = true,overrideable = true,shouldOverride = false),
    "over_quota" -> ValidityCheck(invalid = false,overrideable = true,shouldOverride = false),
    "current_deny_lease" -> ValidityCheck(invalid = false,overrideable = true,shouldOverride = false),
    "no_rights" -> ValidityCheck(invalid = true,overrideable = true,shouldOverride = false),
    "conditional_paid" -> ValidityCheck(invalid = false,overrideable = true,shouldOverride = false),
    "tass_agency_image" -> ValidityCheck(invalid = false, overrideable = true, shouldOverride = true)
  )

  private val imageValidityMappings = Map(
    "missing_description" -> ValidityCheck(invalid = true, overrideable = false, shouldOverride = false),
    "missing_credit" -> ValidityCheck(invalid = true, overrideable = false, shouldOverride = false)
  )

  private val baseValidityMap = baseMappings ++ imageValidityMappings

  describe("non-downloadable Image") {

    it("should generate downloadable validity map") {
      baseMappings should be(ImageExtras.downloadableMap(baseImage, withWritePermission = false))
    }

    it("should report validity") {
      val validityMap = ImageExtras.validityMap(baseImage, withWritePermission = false)
      val validity = ImageExtras.isValid(baseMappings)

      validity should be(false)
    }

    it("should report overridden validity") {
      val validityMap = ImageExtras.downloadableMap(baseImage, withWritePermission = true)
      val validity = ImageExtras.isValid(validityMap)

      validity should be(true)
    }

    it("should report all non-downloadable reasons") {
      val validityMap = ImageExtras.downloadableMap(baseImage, withWritePermission = false)
      val invalidReasons = ImageExtras.invalidReasons(validityMap)
      val expectedInvalidReasons = Map(
        "paid_image" -> "Paid imagery requires a lease",
        "no_rights" -> "No rights to use this image"
      )

      expectedInvalidReasons should be(invalidReasons)
    }

    it("should report all non-downloadbable reasons if write permissions are true") {
      val validityMap = ImageExtras.downloadableMap(baseImage, withWritePermission = true)
      val invalidReasons = ImageExtras.invalidReasons(validityMap)
      val expectedInvalidReasons = Map(
        "paid_image" -> "Paid imagery requires a lease",
        "no_rights" -> "No rights to use this image"
      )

      expectedInvalidReasons should be(invalidReasons)
    }
  }

  describe("Invalid Images") {
    it("should generate validityMaps") {
      baseValidityMap should be(ImageExtras.validityMap(baseImage, withWritePermission = false))
    }

    it("should report validity") {
      val validityMap  = ImageExtras.validityMap(baseImage, withWritePermission = false)
      val validity = ImageExtras.isValid(validityMap)

      validity should be(false)
    }

    it("should report overridden validity") {
      val overrideableImage = baseImage.copy(metadata = validImageMetadata)
      val validityMap  = ImageExtras.validityMap(overrideableImage, withWritePermission = true)
      val validity = ImageExtras.isValid(validityMap)

      validity should be(true)
    }

    it("should report invalid when fields cannot be overridden") {
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
        "paid_image" -> "Paid imagery requires a lease",
        "missing_description" -> "Missing description *",
        "missing_credit" -> "Missing credit information *",
        "no_rights" -> "No rights to use this image"
      )

      expectedInvalidReasons should be(invalidReasons)
    }
  }

  describe("userMayUndeleteImage") {
    // simplified authorisationProvider which only allows "admin@example.net" to delete images, all
    // other users cannot
    val mockAuthorisationProvider = new AuthorisationProvider {
      override def hasPermissionTo(permission: SimplePermission, principal: Principal): Boolean = {
        if (permission == DeleteImage) {
          principal.accessor.identity == "admin@example.net"
        } else {
          true
        }
      }

      override def hasBasicAccess(userEmail: String): Boolean = true
    }

    val authorisation = new Authorisation(
      provider = mockAuthorisationProvider,
      executionContext = global
    )

    it("should deny if user does not have permission") {
      val user = Authentication.UserPrincipal(
        "Jane", "Bloggs", "jane.bloggs@example.net"
      )
      val image = createImage(
        id = "xyz",
        usageRights = staffPhotographer,
        softDeletedMetadata = Some(deletionData("wile.e.coyote@acme.org"))
      )

      ImageExtras.userMayUndeleteImage(user, image, authorisation) shouldBe false
    }

    it("should allow if image was deleted by reaper") {
      val user = Authentication.UserPrincipal(
        "Jane", "Bloggs", "jane.bloggs@example.net"
      )
      val image = createImage(
        id = "xyz",
        usageRights = staffPhotographer,
        softDeletedMetadata = Some(deletionData("reaper"))
      )

      ImageExtras.userMayUndeleteImage(user, image, authorisation) shouldBe true
    }

    it("should allow if user is admin (has permission to delete)") {
      val user = Authentication.UserPrincipal(
        "Big", "Boss", "admin@example.net"
      )
      val image = createImage(
        id = "xyz",
        usageRights = staffPhotographer,
        softDeletedMetadata = Some(deletionData("wile.e.coyote@acme.org"))
      )

      ImageExtras.userMayUndeleteImage(user, image, authorisation) shouldBe true
    }

    it("should allow if user uploaded the image") {
      val user = Authentication.UserPrincipal(
        "Jane", "Bloggs", "jane.bloggs@example.net"
      )
      val image = createImage(
        id = "xyz",
        usageRights = staffPhotographer,
        uploadedBy = "jane.bloggs@example.net",
        softDeletedMetadata = Some(deletionData("wile.e.coyote@acme.org"))
      )

      ImageExtras.userMayUndeleteImage(user, image, authorisation) shouldBe true
    }
  }
}
