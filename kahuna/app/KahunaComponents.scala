import com.gu.mediaservice.lib.management.InnerServiceStatusCheckController
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
  val InnerServiceStatusCheckController = new InnerServiceStatusCheckController(auth, controllerComponents, config.services, wsClient)

  final override val router = new Routes(httpErrorHandler, controller, assets, management, InnerServiceStatusCheckController)

}

object KahunaSecurityConfig {
  def apply(config: KahunaConfig, playConfig: Configuration): SecurityHeadersConfig = {
    val base = SecurityHeadersConfig.fromConfiguration(playConfig)

    def cspClause(directive: String, sources: Set[String]): String = s"$directive ${sources.mkString(" ")}"

    val frameSources = cspClause("frame-src", Set(
      config.services.authBaseUri,
      config.services.kahunaBaseUri)
      ++ config.frameSources
      ++ config.scriptsToLoad.flatMap(_.cspFrameSources)
    )
    val frameAncestors = cspClause("frame-ancestors",
      config.frameAncestors
    )
    val connectSources = cspClause("connect-src", Set(
      "'self'",
      config.imageOrigin,
      config.services.apiBaseUri,
      config.services.loaderBaseUri,
      config.services.cropperBaseUri,
      config.services.metadataBaseUri,
      config.services.imgopsBaseUri,
      config.services.usageBaseUri,
      config.services.collectionsBaseUri,
      config.services.leasesBaseUri,
      config.services.authBaseUri,
      config.services.guardianWitnessBaseUri)
      ++ config.connectSources
    )

    val imageSources = cspClause("img-src", Set(
      "'self'",
      "data:",
      "blob:",
      URI.ensureSecure(config.services.imgopsBaseUri).toString,
      URI.ensureSecure(config.fullOrigin).toString,
      URI.ensureSecure(config.thumbOrigin).toString,
      URI.ensureSecure(config.cropOrigin).toString,
      URI.ensureSecure("app.getsentry.com").toString)
      ++ config.scriptsToLoad.flatMap(_.cspImageSources)
      ++ config.imageSources
    )

    val fontSources = cspClause("font-src", Set(
      "'self'")
      ++ config.fontSources
    )

    val scriptSources = cspClause("script-src", Set(
      "'self'",
      "'unsafe-inline'")
      ++ config.scriptsToLoad.flatMap(_.cspScriptSources)
    )

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
