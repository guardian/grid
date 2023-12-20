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
  val permissionsOptions: Option[String] = stringOpt("permissionsOptions").filterNot(_.isEmpty)
  val permissionsLabels: Option[String] = stringOpt("permissionsLabels").filterNot(_.isEmpty)
  val permissionsMappings: Option[String] = stringOpt("permissionsMappings").filterNot(_.isEmpty)
  val permissionsDefault: Option[String] = stringOpt("permissionsDefault").filterNot(_.isEmpty)
  val permissionsPayable: Option[String] = stringOpt("permissionsPayable").filterNot(_.isEmpty)

  val showDenySyndicationWarning: Option[Boolean] = booleanOpt("showDenySyndicationWarning")

  val frameAncestors: Set[String] = getStringSet("security.frameAncestors")
  val connectSources: Set[String] = getStringSet("security.connectSources") ++ maybeIngestBucket.map { ingestBucket =>
    if (isDev) "https://localstack.media.local.dev-gutools.co.uk"
    else s"https://$ingestBucket.s3.$awsRegion.amazonaws.com"
  }
  val fontSources: Set[String] = getStringSet("security.fontSources")

  val scriptsToLoad: List[ScriptToLoad] = getConfigList("scriptsToLoad").map(entry => ScriptToLoad(
    host = entry.getString("host"),
    path = entry.getString("path"),
    async = if (entry.hasPath("async")) Some(entry.getBoolean("async")) else None,
    // FIXME ideally the below would not hardcode reference to pinboard - hopefully future iterations of the pluggable authorisation will support evaluating permissions without a corresponding case object
    permission = if (entry.hasPath("permission") && entry.getString("permission") == "pinboard") Some(Pinboard) else None,
    shouldLoadWhenIFramed = if (entry.hasPath("shouldLoadWhenIFramed")) Some(entry.getBoolean("shouldLoadWhenIFramed")) else None,
  ))

  val metadataTemplates: Seq[MetadataTemplate] = configuration.get[Seq[MetadataTemplate]]("metadata.templates")

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

