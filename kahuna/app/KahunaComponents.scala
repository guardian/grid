import com.gu.mediaservice.lib.play.{GridAuthentication, GridComponents}
import controllers.{AssetsComponents, KahunaController}
import play.api.ApplicationLoader.Context
import play.filters.headers.SecurityHeadersConfig
import router.Routes

import scala.collection.JavaConverters._

class KahunaComponents(context: Context) extends GridComponents("kahuna", context) with GridAuthentication with AssetsComponents {
  val toolsDomains = config.underlying.getStringList("domain.tools").asScala

  val thumbOrigin = config.get[String]("origin.thumb")
  val fullOrigin = config.get[String]("origin.full")
  val cropOrigin = config.get[String]("origin.crops")
  val imageOrigin = config.get[String]("origin.images")

  val sentryDsn = config.getOptional[String]("sentry.dsn")
  val googleTrackingId = config.getOptional[String]("google.tracking.id")
  val googleAnalytics = googleTrackingId.map(_ => "www.google-analytics.com").getOrElse("")

  val serviceUris = List(
    services.apiBaseUri,
    services.loaderBaseUri,
    services.cropperBaseUri,
    services.metadataBaseUri,
    services.imgopsBaseUri,
    services.usageBaseUri,
    services.collectionsBaseUri,
    services.leasesBaseUri,
    services.authBaseUri,
    services.guardianWitnessBaseUri,
    imageOrigin
  )

  val frameSources = s"frame-src ${services.authBaseUri} ${services.kahunaBaseUri} https://accounts.google.com"
  val frameAncestors = s"frame-ancestors ${toolsDomains.map(domain => s"*.$domain").mkString(" ")}"
  val connectSources = s"connect-src ${serviceUris.mkString(" ")} 'self' $googleAnalytics"
  val imageSources = s"img-src data: blob: ${services.imgopsBaseUri} https://$fullOrigin https://$thumbOrigin https://$cropOrigin $googleAnalytics 'self'"
  val fontSources = s"font-src data: 'self'"

  final override lazy val securityHeadersConfig: SecurityHeadersConfig = SecurityHeadersConfig.fromConfiguration(configuration).copy(
    // covered by frame-ancestors in contentSecurityPolicy
    frameOptions = None,
    // We use inline styles and script tags <sad face>
    contentSecurityPolicy = Some(s"$frameSources; $frameAncestors; $connectSources; $fontSources; $imageSources; default-src 'unsafe-inline' 'self'; script-src 'self' 'unsafe-inline' www.google-analytics.com;")
  )

  val controller = new KahunaController(auth, services, sentryDsn, googleTrackingId, controllerComponents)
  final override val router = new Routes(httpErrorHandler, controller, assets, management)
}
