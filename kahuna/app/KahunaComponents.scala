import com.gu.mediaservice.lib.net.URI
import com.gu.mediaservice.lib.play.{ConnectionBrokenFilter, GridComponents, RequestLoggingFilter, RequestMetricFilter}
import com.gu.mediaservice.model.Instance
import controllers.{AssetsComponents, KahunaController}
import lib.KahunaConfig
import play.api.ApplicationLoader.Context
import play.api.Configuration
import play.api.mvc.EssentialFilter
import play.filters.headers.SecurityHeadersConfig
import router.Routes

class KahunaComponents(context: Context) extends GridComponents(context, new KahunaConfig(_)) with AssetsComponents {
  final override val buildInfo = utils.buildinfo.BuildInfo

  override def httpFilters: Seq[EssentialFilter] = Seq(
    instanceSpecificCorsFilter,
    //csrfFilter TODO no longer gets bypassed thanks to preceding CORS check; CORS filter does not appear to tag the request if it passes for same origin.
    new InstanceSpecificSecurityHeaderFilter(config, context.initialConfiguration),
    gzipFilter,
    new RequestLoggingFilter(materializer),
    new ConnectionBrokenFilter(materializer),
    new RequestMetricFilter(config, materializer, actorSystem, applicationLifecycle)
  )

  val controller = new KahunaController(auth, config, controllerComponents, authorisation)

  final override val router = new Routes(httpErrorHandler, controller, assets, management)

}

object KahunaSecurityConfig {
  def apply(config: KahunaConfig, playConfig: Configuration, instance: Instance): SecurityHeadersConfig = {
    val base = SecurityHeadersConfig.fromConfiguration(playConfig)

    val services = List(
      config.services.apiBaseUri(instance),
      config.services.loaderBaseUri(instance),
      config.services.cropperBaseUri(instance),
      config.services.metadataBaseUri(instance),
      config.services.imgopsBaseUri(instance),
      config.services.usageBaseUri(instance),
      config.services.collectionsBaseUri(instance),
      config.services.leasesBaseUri(instance),
      config.services.authBaseUri(instance),
      config.services.guardianWitnessBaseUri
    )

    // TODO restore ${config.services.authBaseUri} ${config.services.kahunaBaseUri}
    val frameSources = s"frame-src https://accounts.google.com https://www.youtube.com ${config.scriptsToLoad.map(_.host).mkString(" ")}"
    val frameAncestors = s"frame-ancestors ${config.frameAncestors.mkString(" ")}"
    val connectSources = s"connect-src 'self' ${(services :+ config.imageOrigin).mkString(" ")} ${config.connectSources.mkString(" ")}"

    val str = List(
      "data:",
      "blob:",
      URI.ensureSecure(config.services.imgopsBaseUri(instance)).toString,
      URI.ensureSecure(config.fullOrigin).toString,
      URI.ensureSecure(config.thumbOrigin).toString,
      URI.ensureSecure(config.cropOrigin).toString,
      URI.ensureSecure("app.getsentry.com").toString,
      "https://*.googleusercontent.com",
      "'self'"
    ).mkString(" ")

    val imageSources = s"img-src $str ${config.imageSources.mkString(" ")}"

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
