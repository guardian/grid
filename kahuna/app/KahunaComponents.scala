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

  val controller = new KahunaController(auth, config, controllerComponents, authorisation)

  final override val router = new Routes(httpErrorHandler, controller, assets, management)

}

object KahunaSecurityConfig {
  def apply(config: KahunaConfig, playConfig: Configuration): SecurityHeadersConfig = {
    val base = SecurityHeadersConfig.fromConfiguration(playConfig)

    val services = List(
      // TODO Restore config.services.apiBaseUri,
      // TODO Restore config.services.loaderBaseUri,
      // TODO Restore config.services.cropperBaseUri,
      // TODO Restore config.services.metadataBaseUri,
      // TODO restore config.services.imgopsBaseUri,
      // TODO Restore config.services.usageBaseUri,
      // TODO Restore config.services.collectionsBaseUri,
      // TODO Restore config.services.leasesBaseUri,
      config.services.authBaseUri,
      config.services.guardianWitnessBaseUri
    )

    val frameSources = s"frame-src ${config.services.authBaseUri} ${config.services.kahunaBaseUri} https://accounts.google.com https://www.youtube.com ${config.scriptsToLoad.map(_.host).mkString(" ")}"
    val frameAncestors = s"frame-ancestors ${config.frameAncestors.mkString(" ")}"
    val connectSources = s"connect-src 'self' ${(services :+ config.imageOrigin).mkString(" ")} ${config.connectSources.mkString(" ")}"

    val imageSources = s"img-src ${List(
      "data:",
      "blob:",
      // TODO restore URI.ensureSecure(config.services.imgopsBaseUri).toString,
      URI.ensureSecure(config.fullOrigin).toString,
      URI.ensureSecure(config.thumbOrigin).toString,
      URI.ensureSecure(config.cropOrigin).toString,
      URI.ensureSecure("app.getsentry.com").toString,
      "https://*.googleusercontent.com",
      "'self'"
    ).mkString(" ")} ${config.imageSources.mkString(" ")}"

    val fontSources = s"font-src data: 'self' ${config.fontSources.mkString(" ")}"

    val scriptSources = s"script-src 'self' 'unsafe-inline' ${config.scriptsToLoad.map(_.host).mkString(" ")}"

    base.copy(
      // covered by frame-ancestors in contentSecurityPolicy
      frameOptions = None,
      // We use inline styles and script tags <sad face>
      contentSecurityPolicy = Some(
        List(
          frameSources,
          frameAncestors,
          connectSources,
          fontSources,
          imageSources,
          "default-src 'unsafe-inline' 'self'",
          scriptSources
        ).mkString("; ")
      )
    )
  }
}
