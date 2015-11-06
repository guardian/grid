package model

import play.api.libs.json._


case class MediaSource(
  uri: Option[String] = None,
  name: Option[String] = None
)
object MediaSource {
  implicit val writes: Writes[MediaSource] = Json.writes[MediaSource]

  def build (usage: MediaUsage): Map[String, MediaSource] = {
    usage.usageType match {
      case "web" => buildWeb(usage)
      case "print" => buildPrint(usage)
    }
  }

  def buildPrint(usage: MediaUsage): Map[String, MediaSource] = {
    Map("indesign" -> MediaSource(usage.data.get("containerId"), usage.data.get("storyName")))
  }

  def buildWeb(usage: MediaUsage): Map[String, MediaSource] = {
    Map("frontend" -> MediaSource(usage.data.get("webUrl"), usage.data.get("webTitle"))) ++
      usage.data.get("composerUrl").map(
        composerUrl => "composer" -> MediaSource(Some(composerUrl))
      )
  }
}
