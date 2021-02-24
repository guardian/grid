package lib

import com.gu.mediaservice.lib.config.{CommonConfig, FileMetadataConfig, GridConfigResources}
import com.typesafe.config.ConfigObject

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

  val fileMetadataConfigs: Seq[FileMetadataConfig] = configObjectOpt("filemetadata.configurations") match {
    case Some(config) => config.entrySet().asScala.flatMap { directory =>
      directory.getValue.asInstanceOf[ConfigObject].entrySet().asScala.map { directoryConfig =>
        val config = directoryConfig.getValue.asInstanceOf[ConfigObject].toConfig
        FileMetadataConfig(
          directory = directory.getKey,
          tag = config.getString("tag"),
          visible = config.getBoolean("visible"),
          searchable = config.getBoolean("searchable"),
          alias = if (config.hasPath("alias")) Some(config.getString("alias")) else None
        )
      }
    }.toList
    case None => List.empty
  }
}
