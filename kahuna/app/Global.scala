import scala.collection.JavaConverters._
import com.typesafe.config.ConfigValue

import play.api.{Logger, Application, GlobalSettings}
import play.api.mvc.WithFilters
import play.filters.gzip.GzipFilter

import play.filters.headers.{SecurityHeadersFilter, DefaultSecurityHeadersConfig, SecurityHeadersConfig, SecurityHeadersParser}

import lib.{LogConfig, Config, ForceHTTPSFilter}

import com.gu.mediaservice.lib.play.RequestLoggingFilter

object FrameOptions {
  lazy val configuration = play.api.Play.current.configuration

  lazy val securityHeadersConfig: DefaultSecurityHeadersConfig =
    new SecurityHeadersParser().parse(configuration).asInstanceOf[DefaultSecurityHeadersConfig]

  lazy val sameOriginConfig: SecurityHeadersConfig =
    securityHeadersConfig.copy(frameOptions = Some(s"ALLOW-FROM ${Config.services.composerHost}"))

  lazy val filter = SecurityHeadersFilter(sameOriginConfig)
}

object Global extends WithFilters(
  FrameOptions.filter,
  ForceHTTPSFilter,
  RequestLoggingFilter,
  new GzipFilter
) with GlobalSettings {

  override def beforeStart(app: Application) {
    LogConfig.init(Config)

    val allAppConfig: Seq[(String, ConfigValue)] =
      Config.appConfig.underlying.entrySet.asScala.toSeq.map(entry => (entry.getKey, entry.getValue))

    Logger.info("Play app config: \n" + allAppConfig.mkString("\n"))
  }

}
