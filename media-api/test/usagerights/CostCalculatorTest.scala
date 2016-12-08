package lib.usagerights

import com.gu.mediaservice.model._
import org.scalatest.{FunSpec, Matchers}
import lib.UsageQuota

class CostCalculatorTest extends FunSpec with Matchers {

  describe("from usage rights") {

    val usageQuota = new UsageQuota {
      val usageStore = None
      val quotaStore = None
    }

    object Costing extends CostCalculator {
      val quotas = usageQuota
      override def getOverQuota(usageRights: UsageRights) = None
    }

    object OverQuotaCosting extends CostCalculator {
      val quotas = usageQuota
      override def getOverQuota(usageRights: UsageRights) = Some(Overquota)
    }

    it("should be free with a free category") {
      val usageRights = Handout()
      val cost = Costing.getCost(usageRights)

      cost should be (Free)
    }

    it("should be conditional with a free category and restrictions") {
      val usageRights = Handout(
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
