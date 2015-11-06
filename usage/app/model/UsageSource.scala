package model

import play.api.libs.json._


case class UsageSource(
  uri: Option[String] = None,
  name: Option[String] = None
)
object UsageSource {
  implicit val writes: Writes[UsageSource] = Json.writes[UsageSource]

  def build (usage: MediaUsage): Map[String, UsageSource] = {
    usage.usageType match {
      case "web" => buildWeb(usage)
      case "print" => buildPrint(usage)
    }
  }

  private def buildPrint(usage: MediaUsage): Map[String, UsageSource] = {
    Map("indesign" -> UsageSource(usage.data.get("containerId"), usage.data.get("storyName")))
  }

  private def buildWeb(usage: MediaUsage): Map[String, UsageSource] = {
    Map("frontend" -> UsageSource(usage.data.get("webUrl"), usage.data.get("webTitle"))) ++
      usage.data.get("composerUrl").map(
        composerUrl => "composer" -> UsageSource(Some(composerUrl))
      )
  }
}
