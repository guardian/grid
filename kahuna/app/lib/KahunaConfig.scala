package lib

import com.gu.mediaservice.lib.auth.Permissions.Pinboard
import com.gu.mediaservice.lib.auth.SimplePermission
import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}

case class ScriptToLoad(
  host: String,
  path: String,
  async: Option[Boolean],
  permission: Option[SimplePermission],
  shouldLoadWhenIFramed: Option[Boolean]
)

class KahunaConfig(resources: GridConfigResources) extends CommonConfig(resources) {
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

  val homeLinkHtml: Option[String] = stringOpt("branding.homeLinkHtml").filterNot(_.isEmpty)

  val canDownloadCrop: Boolean = boolean("canDownloadCrop")

  val frameAncestors: Set[String] = getStringSet("security.frameAncestors")
  val connectSources: Set[String] = getStringSet("security.connectSources")

  val scriptsToLoad: List[ScriptToLoad] = getConfigList("scriptsToLoad").map(entry => ScriptToLoad(
    host = entry.getString("host"),
    path = entry.getString("path"),
    async = if (entry.hasPath("async")) Some(entry.getBoolean("async")) else None,
    // FIXME ideally the below would not hardcode reference to pinboard - hopefully future iterations of the pluggable authorisation will support evaluating permissions without a corresponding case object
    permission = if (entry.hasPath("permission") && entry.getString("permission") == "pinboard") Some(Pinboard) else None,
    shouldLoadWhenIFramed = if (entry.hasPath("shouldLoadWhenIFramed")) Some(entry.getBoolean("shouldLoadWhenIFramed")) else None,
  ))

  val metadataTemplates: Seq[MetadataTemplate] = configuration.get[Seq[MetadataTemplate]]("metadata.templates")

}

