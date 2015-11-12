package model

import play.api.libs.json._


case class UsageSource(
  usageType: String,
  uri: Option[String] = None,
  name: Option[String] = None
)
object UsageSource {
  implicit val writes: Writes[UsageSource] = Json.writes[UsageSource]

  def build (usage: MediaUsage): List[UsageSource] = {
    usage.usageType match {
      case "web" => buildWeb(usage)
      case "print" => buildPrint(usage)
    }
  }

  private def buildPrint(usage: MediaUsage) = List(
    UsageSource("indesign", usage.data.get("containerId"), usage.data.get("storyName")))

  private def buildWeb(usage: MediaUsage) = List(
    UsageSource("frontend", usage.data.get("webUrl"), usage.data.get("webTitle"))) ++
    usage.data.get("composerUrl").map(composerUrl => UsageSource("composer", Some(composerUrl)))
}
