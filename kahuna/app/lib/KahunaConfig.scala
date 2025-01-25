package lib

import com.gu.mediaservice.lib.auth.Permissions.Pinboard
import com.gu.mediaservice.lib.auth.SimplePermission
import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}
import com.gu.mediaservice.model.Instance
import play.api.libs.json._

case class ScriptToLoad(
  host: String,
  path: String,
  async: Option[Boolean],
  permission: Option[SimplePermission],
  shouldLoadWhenIFramed: Option[Boolean]
)

class KahunaConfig(resources: GridConfigResources) extends CommonConfig(resources) {
  val rootUri: Instance => String = services.kahunaBaseUri
  def mediaApiUri: Instance => String = services.apiBaseUri
  val authUri: Instance => String = services.authBaseUri

  val sentryDsn: Option[String] = stringOpt("sentry.dsn").filterNot(_.isEmpty)

  val thumbOrigin: String = string("origin.thumb")
  val cropOrigin: String = string("origin.crops")

  val costFilterLabel: Option[String] = stringOpt("costFilter.label")
  val costFilterChargeable: Option[Boolean] = booleanOpt("costFilter.chargeable")
  val additionalLinks: Seq[AdditionalLink] = configuration.getOptional[Seq[AdditionalLink]]("links.additional").getOrElse(Seq.empty)
  val feedbackFormLink: Option[String]= stringOpt("links.feedbackForm").filterNot(_.isEmpty)
  val usageRightsHelpLink: Option[String]= stringOpt("links.usageRightsHelp").filterNot(_.isEmpty)
  val invalidSessionHelpLink: Option[String]= stringOpt("links.invalidSessionHelp").filterNot(_.isEmpty)
  val supportEmail: Option[String]= stringOpt("links.supportEmail").filterNot(_.isEmpty)
  val telemetryUri: Option[String] = stringOpt("links.telemetryUri").filterNot(_.isEmpty)

  val homeLinkHtml: Option[String] = stringOpt("branding.homeLinkHtml").filterNot(_.isEmpty)

  val canDownloadCrop: Boolean = boolean("canDownloadCrop")
  val restrictDownload: Option[Boolean] = booleanOpt("restrictDownload")
  val useReaper: Option[Boolean] = booleanOpt("useReaper")

  // interim permissions filter configuration settings
  val usePermissionsFilter: Option[Boolean] = booleanOpt("usePermissionsFilter")
  val usageRightsSummary: Option[Boolean] = booleanOpt("usageRightsSummary")
  val permissionsDefault: Option[String] = stringOpt("permissionsDefault").filterNot(_.isEmpty)
  val interimFilterOptions: Seq[InterimFilterOption] = configuration.getOptional[Seq[InterimFilterOption]]("interimFilterOptions").getOrElse(Seq.empty)

  val showDenySyndicationWarning: Option[Boolean] = booleanOpt("showDenySyndicationWarning")
  val showSendToPhotoSales: Option[Boolean] = booleanOpt("showSendToPhotoSales")

  val frameAncestors: Set[String] = getStringSet("security.frameAncestors")
  val connectSources: Set[String] = getStringSet("security.connectSources") ++ maybeIngestBucket.map { ingestBucket =>
    if (isDev) "https://localstack.media.local.dev-gutools.co.uk"
    else s"https://${ingestBucket.bucket}.${ingestBucket.endpoint}"
  }
  val fontSources: Set[String] = getStringSet("security.fontSources")
  val imageSources: Set[String] = getStringSet("security.imageSources")

  val scriptsToLoad: List[ScriptToLoad] = getConfigList("scriptsToLoad").map(entry => ScriptToLoad(
    host = entry.getString("host"),
    path = entry.getString("path"),
    async = if (entry.hasPath("async")) Some(entry.getBoolean("async")) else None,
    // FIXME ideally the below would not hardcode reference to pinboard - hopefully future iterations of the pluggable authorisation will support evaluating permissions without a corresponding case object
    permission = if (entry.hasPath("permission") && entry.getString("permission") == "pinboard") Some(Pinboard) else None,
    shouldLoadWhenIFramed = if (entry.hasPath("shouldLoadWhenIFramed")) Some(entry.getBoolean("shouldLoadWhenIFramed")) else None,
  ))

  val metadataTemplates: Seq[MetadataTemplate] = configuration.get[Seq[MetadataTemplate]]("metadata.templates")

  val announcements: Seq[Announcement] = configuration.getOptional[Seq[Announcement]]("announcements").getOrElse(Seq.empty)

  val imageTypes: Seq[String] = configuration.getOptional[Seq[String]]("imageTypes").getOrElse(Seq.empty)

  //BBC custom warning text
  val warningTextHeader: String = configuration.getOptional[String]("warningText.header")
    .getOrElse("This image can be used, but has warnings:")
  val warningTextHeaderNoRights: String = configuration.getOptional[String]("warningText.headerNoRights")
    .getOrElse("This image can be used, but has warnings:")
  val unusableTextHeader: String = configuration.getOptional[String]("warningText.unusableHeader")
    .getOrElse("Unusable image")
  val denySyndicationTextHeader: String = configuration.getOptional[String]("warningText.denySyndicationHeader")
    .getOrElse("Syndication denied")
  val enableWarningFlags: Boolean = configuration.getOptional[Map[String, String]]("warningText.imagePreviewFlag").isDefined
  val imagePreviewFlagAlertCopy: String = configuration.getOptional[String]("warningText.imagePreviewFlag.alertCopy")
    .getOrElse("Not configured")
  val imagePreviewFlagWarningCopy: String = configuration.getOptional[String]("warningText.imagePreviewFlag.warningCopy")
    .getOrElse("Not configured")
  val imagePreviewFlagLeaseAttachedCopy: String = configuration.getOptional[String]("warningText.imagePreviewFlag.leaseAttachedCopy")
    .getOrElse("Not configured")

  val shouldUploadStraightToBucket: Boolean = maybeIngestBucket.isDefined
}

