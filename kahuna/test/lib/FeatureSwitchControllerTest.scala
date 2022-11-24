package lib

import controllers.{ExampleSwitch, FeatureSwitch, FeatureSwitchController}
import org.scalatest.freespec.AnyFreeSpec
import org.scalatest.matchers.should.Matchers
import play.api.mvc.Cookie

object NoCookieSwitch extends FeatureSwitch(
  key = "no-cookie-switch",
  title = "A switch with no matching cookie",
  default = false
)

class FeatureSwitchControllerTest extends AnyFreeSpec with Matchers{
  val featureSwitchController = new FeatureSwitchController(List(ExampleSwitch, NoCookieSwitch))
  val exampleSwitchCookie = new Cookie("example-switch", "true");

  val mockCookieRetriever = (key: String) => {
    key match {
      case "feature-switch-example-switch" => Some(exampleSwitchCookie)
      case _ => None
    }
  }

  "getFeatureSwitchCookies" - {
    "should return a list of feature switches alongside an option of matching cookies" in {
      val matches =  featureSwitchController.getFeatureSwitchCookies(mockCookieRetriever)
      matches shouldBe List(
        (ExampleSwitch, Some(exampleSwitchCookie)),
        (NoCookieSwitch, None)
      )
    }
  }

  "getClientSwitchValues" - {
    "should return a map from feature switch to boolean representing cookie values" in {
      val matches = featureSwitchController.getFeatureSwitchCookies(mockCookieRetriever)
      val clientSwitchValues = featureSwitchController.getClientSwitchValues(matches)

      clientSwitchValues shouldBe Map(
        ExampleSwitch -> true,
        NoCookieSwitch -> false,
      )
    }
  }

  "getFeatureSwitchesToStringify" - {
    "should return a map of key, value and title to string for each switch" in {
      val matches = featureSwitchController.getFeatureSwitchCookies(mockCookieRetriever)
      val clientSwitchValues = featureSwitchController.getClientSwitchValues(matches)
      val stringifiable = featureSwitchController.getFeatureSwitchesToStringify(clientSwitchValues)

      stringifiable shouldBe List(
        Map(
          "key" -> "example-switch",
          "title" -> "An example switch. Use rounded corners for the feature switch toggle",
          "value" -> "true"
        ),
        Map(
          "key" -> "no-cookie-switch",
          "title" -> "A switch with no matching cookie",
          "value" -> "false"
        )
      )
    }

    "getFeatureSwitchValue" - {
      "should return the value of a feature switch" - {
        val matches = featureSwitchController.getFeatureSwitchCookies(mockCookieRetriever)
        val clientSwitchValues = featureSwitchController.getClientSwitchValues(matches)
        val exampleValue1 = featureSwitchController.getFeatureSwitchValue(clientSwitchValues, "example-switch")
        val exampleValue2 = featureSwitchController.getFeatureSwitchValue(clientSwitchValues, "no-cookie-switch")
        exampleValue1 shouldBe(true)
        exampleValue2 shouldBe(false)
      }
    }
  }
}
