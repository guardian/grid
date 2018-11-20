
import com.gu.mediaservice.lib.play.GridComponents
import controllers.{AssetsComponents, KahunaController}
import lib.KahunaConfig
import play.api.ApplicationLoader.Context
import play.api.Configuration
import play.filters.headers.SecurityHeadersConfig
import router.Routes

class KahunaComponents(context: Context) extends GridComponents(context) with AssetsComponents {
  final override lazy val config = new KahunaConfig()
  final override lazy val securityHeadersConfig: SecurityHeadersConfig = KahunaSecurityConfig(config, context.initialConfiguration)

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
    val frameAncestors = s"frame-ancestors ${config.services.toolsDomains.map(domain => s"*.$domain").mkString(" ")}"
    val connectSources = s"connect-src ${(services :+ config.imageOrigin).mkString(" ")} 'self' www.google-analytics.com"

    val imageSources = s"img-src data: blob: ${config.services.imgopsBaseUri} https://${config.fullOrigin} https://${config.thumbOrigin} ${config.cropOrigin} www.google-analytics.com 'self'"

    base.copy(
      // covered by frame-ancestors in contentSecurityPolicy
      frameOptions = None,
      // We use inline styles and script tags <sad face>
      contentSecurityPolicy = Some(s"$frameSources; $frameAncestors; $connectSources; $imageSources; default-src 'unsafe-inline' 'self'; script-src 'self' 'unsafe-inline' www.google-analytics.com;")
    )
  }
}
