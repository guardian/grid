package lib.usagerights

import com.gu.mediaservice.model._
import org.scalatest.{FunSpec, Matchers}

class CostCalculatorTest extends FunSpec with Matchers {

  describe("from usage rights") {

    it("should be free with a free category") {
      val usageRights = uHandout()
      val cost = CostCalculator.getCost(usageRights)

      cost should be (Some(Free))
    }

    it("should be conditional with a free category and restrictions") {
      val usageRights = uHandout(
        restrictions = Some("Restrictions")
      )
      val cost = CostCalculator.getCost(usageRights)

      cost should be (Some(Conditional))
    }

    it("should be free with a free supplier") {
      val usageRights = uAgency("Getty Images")
      val cost = CostCalculator.getCost(usageRights)

      cost should be (Some(Free))
    }

    it("should not be free with a free supplier but excluded collection") {
      val usageRights = uAgency("Getty Images", Some("Anadolu"))
      val cost = CostCalculator.getCost(usageRights)

      cost should be (None)
    }
  }
}
