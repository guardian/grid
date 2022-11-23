package lib.usagerights

import com.gu.mediaservice.lib.guardian.GuardianUsageRightsConfig
import com.gu.mediaservice.model._
import lib.UsageQuota
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar

class CostCalculatorTest extends AnyFunSpec with Matchers with MockitoSugar {

  describe("from usage rights") {

    val Quota = mock[UsageQuota]

    val costing: CostCalculator =
      new CostCalculator(GuardianUsageRightsConfig.freeSuppliers, GuardianUsageRightsConfig.suppliersCollectionExcl, Quota) {
        override def getOverQuota(usageRights: UsageRights): Option[Cost] = None
      }

    val overQuotaCosting: CostCalculator =
      new CostCalculator(GuardianUsageRightsConfig.freeSuppliers, GuardianUsageRightsConfig.suppliersCollectionExcl, Quota) {
        override def getOverQuota(usageRights: UsageRights): Option[Cost] = Some(Overquota)
      }

    it("should be free with a free category") {
      val usageRights = Obituary()
      val cost = costing.getCost(usageRights)

      cost should be (Free)
    }

    it("should be conditional with a free category and restrictions") {
      val usageRights = Obituary(
        restrictions = Some("Restrictions")
      )
      val cost = costing.getCost(usageRights)

      cost should be (Conditional)
    }

    it("should be free with a free supplier") {
      val usageRights = Agency("Getty Images")
      val cost = costing.getCost(usageRights)

      cost should be (Free)
    }

    it("should be overquota with an overquota supplier") {
      val usageRights = Agency("Getty Images")
      val cost = overQuotaCosting.getCost(usageRights)

      cost should be (Overquota)
    }

    it("should not be free-to-use with a free supplier but excluded collection") {
      val usageRights = Agency("Getty Images", Some("Bob Thomas Sports Photography"))
      val cost = costing.getCost(usageRights)

      cost should be (Pay)
    }
  }
}
