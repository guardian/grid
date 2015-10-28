package lib.usagerights

import com.gu.mediaservice.model._
import org.scalatest.{FunSpec, Matchers}

class CostCalculatorTest extends FunSpec with Matchers {

  describe("from usage rights") {

    it("should be free with a free category") {
      val usageRights = Handout()
      val cost = CostCalculator.getCost(usageRights)

      cost should be (Free)
    }

    it("should be conditional with a free category and restrictions") {
      val usageRights = Handout(
        restrictions = Some("Restrictions")
      )
      val cost = CostCalculator.getCost(usageRights)

      cost should be (Conditional)
    }

    it("should be free with a free supplier") {
      val usageRights = Agency("Getty Images")
      val cost = CostCalculator.getCost(usageRights)

      cost should be (Free)
    }

    it("should not be pay-for with a free supplier but excluded collection") {
      val usageRights = Agency("Getty Images", Some("Terry O'Neill"))
      val cost = CostCalculator.getCost(usageRights)

      cost should be (Pay)
    }
  }
}
