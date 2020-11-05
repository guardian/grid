import com.gu.mediaservice.lib.net.URI
import com.gu.mediaservice.lib.play.GridComponents
import controllers.{AssetsComponents, KahunaController}
import lib.KahunaConfig
import play.api.ApplicationLoader.Context
import play.api.Configuration
import play.filters.headers.SecurityHeadersConfig
import router.Routes

class KahunaComponents(context: Context) extends GridComponents(context, new KahunaConfig(_)) with AssetsComponents {
  final override lazy val securityHeadersConfig: SecurityHeadersConfig = KahunaSecurityConfig(config, context.initialConfiguration)

  final override val buildInfo = utils.buildinfo.BuildInfo

  val controller = new KahunaController(auth, config, controllerComponents)
  final override val router = new Routes(httpErrorHandler, controller, assets, management)

}

object KahunaSecurityConfig {
  def apply(config: KahunaConfig, playConfig: Configuration): SecurityHeadersConfig = {
    val base = SecurityHeadersConfig.fromConfiguration(playConfig)

    val services = List(
      config.services.apiBaseUri,
      config.services.loaderBaseUri,
      config.services.cropperBaseUri,
      config.services.metadataBaseUri,
      config.services.imgopsBaseUri,
      config.services.usageBaseUri,
      config.services.collectionsBaseUri,
      config.services.leasesBaseUri,
      config.services.authBaseUri,
      config.services.guardianWitnessBaseUri
    )

    val frameSources = s"frame-src ${config.services.authBaseUri} ${config.services.kahunaBaseUri} https://accounts.google.com"
    val frameAncestors = s"frame-ancestors ${config.frameAncestors.mkString(" ")}"
    val connectSources = s"connect-src ${(services :+ config.imageOrigin).mkString(" ")} 'self' www.google-analytics.com"

    val imageSources: List[String] = List(
      "data:",
      "blob:",
      URI.ensureSecure(config.services.imgopsBaseUri).toString,
      URI.ensureSecure(config.fullOrigin).toString,
      URI.ensureSecure(config.thumbOrigin).toString,
      URI.ensureSecure(config.cropOrigin).toString,
      URI.ensureSecure("www.google-analytics.com").toString,
      URI.ensureSecure("app.getsentry.com").toString,
      "'self'"
    )

    val fontSources = s"font-src data: 'self'"

    base.copy(
      // covered by frame-ancestors in contentSecurityPolicy
      frameOptions = None,
      // We use inline styles and script tags <sad face>
      contentSecurityPolicy = Some(s"$frameSources; $frameAncestors; $connectSources; $fontSources; img-src ${imageSources.mkString(" ")}; default-src 'unsafe-inline' 'self'; script-src 'self' 'unsafe-inline' www.google-analytics.com;")
    )
  }
}
