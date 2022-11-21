package controllers

import play.api.mvc.{AnyContent, Cookie, Request}

case class FeatureSwitch(key: String, title: String, default: Boolean)

object ExampleSwitch extends FeatureSwitch(
  key = "example-switch",
  title = "An example switch to test the feature",
  default = false
)

object FeatureSwitches {
  lazy val featureSwitches = List(
    ExampleSwitch
  )

  def getFeatureSwitchCookies(request: Request[AnyContent]): List[(FeatureSwitch, Option[Cookie])] =
    featureSwitches.map(featureSwitch => (featureSwitch, request.cookies.get(s"feature-switch-${featureSwitch.key}")))

  def getClientSwitchValues(featureSwitchesWithCookies: List[(FeatureSwitch, Option[Cookie])]): Map[FeatureSwitch, Boolean] = {
    featureSwitchesWithCookies
      .map(featureSwitchWithCookie => featureSwitchWithCookie match{
        case (featureSwitch, Some(cookie)) => (featureSwitch, getBoolean(cookie.value))
        case (featureSwitch, None) => (featureSwitch, featureSwitch.default)
      })
      .toMap
  }

  def getFeatureSwitchesToStringify(clientSwitchValues: Map[FeatureSwitch, Boolean]): List[Map[String, String]] = {
    clientSwitchValues.map(clientSwitch => clientSwitch match {
      case (featureSwitch, value) => Map(
        "key" -> featureSwitch.key,
        "title" -> featureSwitch.title,
        "value" -> value.toString
      )
    }).toList
  }

  def getBoolean(cookieValue: String): Boolean = {
    cookieValue match{
      case "true" => true
      case _ => false
    }
  }
}
