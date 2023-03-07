package lib

import play.api.mvc.Cookie

case class FeatureSwitch(key: String, title: String, default: Boolean)

object ExampleSwitch extends FeatureSwitch(
  key = "example-switch",
  title = "An example switch. Use rounded corners for the feature switch toggle",
  default = false
)
object MultitenancySwitch extends FeatureSwitch(
  key = "multitenancy",
  title = """Multi-tenant behaviour for the grid. Requires setting up the "tenants" config options!""",
  default = false
)

class FeatureSwitches(featureSwitches: List[FeatureSwitch]){
  // Feature switches are defined here, but updated by setting a cookie following the pattern e.g. "feature-switch-my-key"
  // for a switch called "my-key".

  def getFeatureSwitchCookies(cookieGetter: String => Option[Cookie]): List[(FeatureSwitch, Option[Cookie])] =
    featureSwitches.map(featureSwitch => (featureSwitch, cookieGetter(s"feature-switch-${featureSwitch.key}")))

  def getClientSwitchValues(featureSwitchesWithCookies: List[(FeatureSwitch, Option[Cookie])]): Map[FeatureSwitch, Boolean] = {
    featureSwitchesWithCookies
      .map {
        case (featureSwitch, Some(cookie)) => (featureSwitch, getBoolean(cookie.value))
        case (featureSwitch, None) => (featureSwitch, featureSwitch.default)
      }
      .toMap
  }

  def getFeatureSwitchesToStringify(clientSwitchValues: Map[FeatureSwitch, Boolean]): List[Map[String, String]] = {
    clientSwitchValues.map {
      case (featureSwitch, value) => Map(
        "key" -> featureSwitch.key,
        "title" -> featureSwitch.title,
        "value" -> value.toString
      )
    }.toList
  }

  def getFeatureSwitchValue(clientSwitchValues: Map[FeatureSwitch, Boolean], key: String): Boolean = {
    // A getter to use the client-controlled feature switches within this Scala backend
    val maybeSwitch = featureSwitches.find(switch => switch.key == key)
    maybeSwitch.flatMap(switch => clientSwitchValues.get(switch)).getOrElse(false)
  }

  private def getBoolean(cookieValue: String): Boolean = {
    cookieValue match{
      case "true" => true
      case _ => false
    }
  }
}

