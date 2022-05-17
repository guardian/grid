package lib

import play.api.ConfigLoader
import play.api.libs.json.{Json, Writes}

import scala.collection.JavaConverters._

object LinkTarget extends Enumeration {
  val blank = Value("_blank")
  val self = Value("_self")
  val parent = Value("_parent")
  val top = Value("_top")
}

case class AdditionalLink(name: String, url: String, target: LinkTarget.Value = LinkTarget.blank)

object AdditionalLink {
  implicit val writes: Writes[AdditionalLink] = Json.writes[AdditionalLink]

  implicit val configLoader: ConfigLoader[Seq[AdditionalLink]] =
    ConfigLoader(_.getConfigList).map(
      _.asScala.map(config => {
        val linkTarget = if (config.hasPath("target")) LinkTarget.withName(config.getString("target")) else LinkTarget.blank

        AdditionalLink(
          config.getString("name"),
          config.getString("url"),
          linkTarget
        )
      }))
}
