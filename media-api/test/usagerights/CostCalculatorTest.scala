package lib.usagerights

import com.gu.mediaservice.model._
import org.scalatest.{FunSpec, Matchers}

class CostCalculatorTest extends FunSpec with Matchers {

  describe("from usage rights") {

    it("should be free with a free category") {
      val usageRights = Handout()
      val cost = CostCalculator.getCost(usageRights)

      cost should be (Some(Free))
    }

    it("should be conditional with a free category and restrictions") {
      val usageRights = Handout(
        restrictions = Some("Restrictions")
      )
      val cost = CostCalculator.getCost(usageRights)

      cost should be (Some(Conditional))
    }

    it("should be free with a free supplier") {
      val usageRights = Agency("Getty Images")
      val cost = CostCalculator.getCost(usageRights)

      cost should be (Some(Free))
    }

    it("should not be free with a free supplier but excluded collection") {
      val usageRights = Agency("Getty Images", Some("Terry O'Neill"))
      val cost = CostCalculator.getCost(usageRights)

      cost should be (None)
    }

    // HACK: We're trying to figure out what to do with free rights
    it("should allow 'The Guardian' through as a free credit even when there is NoRights") {
      val usageRights = NoRights
      val credit = Some("The Guardian")
      val cost = CostCalculator.getCost(usageRights, credit)

      cost should be (Free)
    }

    it("should work out 'The Guardian' credit to be free, but not other suppliers") {
      val theGuardian = Some("The Guardian")
      val getty = Some("Getty Image")

      val theGuardianCost = CostCalculator.getCost(theGuardian)
      val gettyCost = CostCalculator.getCost(getty)

      theGuardianCost should be (Some(Free))
      gettyCost should be (None)
    }
  }
}
