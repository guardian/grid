package lib.usagerights

import com.gu.mediaservice.model._
import lib.UsageQuota
import org.scalatest.mockito.MockitoSugar
import org.scalatest.{FunSpec, Matchers}

class CostCalculatorTest extends FunSpec with Matchers with MockitoSugar {

  describe("from usage rights") {

    val Quota = mock[UsageQuota]

    object Costing extends CostCalculator {
      val quotas = Quota
      override def getOverQuota(usageRights: UsageRights) = None
    }

    object OverQuotaCosting extends CostCalculator {
      val quotas = Quota
      override def getOverQuota(usageRights: UsageRights) = Some(Overquota)
    }

    it("should be free with a free category") {
      val usageRights = Obituary()
      val cost = Costing.getCost(usageRights)

      cost should be (Free)
    }

    it("should be conditional with a free category and restrictions") {
      val usageRights = Obituary(
        restrictions = Some("Restrictions")
      )
      val cost = Costing.getCost(usageRights)

      cost should be (Conditional)
    }

    it("should be free with a free supplier") {
      val usageRights = Agency("Getty Images")
      val cost = Costing.getCost(usageRights)

      cost should be (Free)
    }

    it("should be overquota with an overquota supplier") {
      val usageRights = Agency("Getty Images")
      val cost = OverQuotaCosting.getCost(usageRights)

      cost should be (Overquota)
    }

    it("should not be pay-for with a free supplier but excluded collection") {
      val usageRights = Agency("Getty Images", Some("Terry O'Neill"))
      val cost = Costing.getCost(usageRights)

      cost should be (Pay)
    }
  }
}
