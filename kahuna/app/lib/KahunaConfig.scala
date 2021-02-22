package lib

import com.gu.mediaservice.lib.config.{CommonConfig, FileMetadataConfig, GridConfigResources}
import scala.collection.JavaConverters._

class KahunaConfig(resources: GridConfigResources) extends CommonConfig(resources.configuration) {
  val rootUri: String = services.kahunaBaseUri
  val mediaApiUri: String = services.apiBaseUri
  val authUri: String = services.authBaseUri

  val sentryDsn: Option[String] = stringOpt("sentry.dsn").filterNot(_.isEmpty)

  val thumbOrigin: String = string("origin.thumb")
  val fullOrigin: String = string("origin.full")
  val cropOrigin: String = string("origin.crops")
  val imageOrigin: String = string("origin.images")
  val googleTrackingId: Option[String] = stringOpt("google.tracking.id").filterNot(_.isEmpty)

  val feedbackFormLink: Option[String]= stringOpt("links.feedbackForm").filterNot(_.isEmpty)
  val usageRightsHelpLink: Option[String]= stringOpt("links.usageRightsHelp").filterNot(_.isEmpty)
  val invalidSessionHelpLink: Option[String]= stringOpt("links.invalidSessionHelp").filterNot(_.isEmpty)
  val supportEmail: Option[String]= stringOpt("links.supportEmail").filterNot(_.isEmpty)

  val frameAncestors: Set[String] = getStringSet("security.frameAncestors")

  val fileMetadataConfig: List[FileMetadataConfig] = configObjectOpt("filemetadata.configurations") match {
    case Some(config) => config.unwrapped().asInstanceOf[java.util.Map[String, java.util.HashMap[String, java.util.HashMap[String, String]]]].asScala.flatMap {
      case (directory, value) if directory.nonEmpty =>
        value.asScala.map {
          case(_, c) =>
            FileMetadataConfig(
              directory = directory,
              tag = c.get("tag"),
              visible = toBool(c.getOrDefault("visible", "false")),
              searchable = toBool(c.getOrDefault("searchable", "false")),
              alias = Some(c.getOrDefault("alias", c.get("tag"))))
        }
    }.toList
    case None => List.empty
  }

  def toBool(str: String): Boolean = str.toBoolean
}
