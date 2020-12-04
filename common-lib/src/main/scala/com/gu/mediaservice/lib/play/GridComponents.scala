package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.{GridLogging, LogConfig}
import com.gu.mediaservice.lib.management.{BuildInfo, Management}
import play.api.ApplicationLoader.Context
import play.api.Logger.logger
import play.api.http.{DefaultHttpErrorHandler, HttpErrorHandler}
import play.api.{BuiltInComponentsFromContext, Configuration, UnexpectedException}
import play.api.libs.ws.ahc.AhcWSComponents
import play.api.mvc.{EssentialFilter, RequestHeader, Result, Results}
import play.filters.HttpFiltersComponents
import play.filters.cors.CORSConfig.Origins
import play.filters.cors.{CORSComponents, CORSConfig}
import play.filters.gzip.GzipFilterComponents

import scala.concurrent.{ExecutionContext, Future}

abstract class GridComponents[Config <: CommonConfig](context: Context, val loadConfig: Configuration => Config) extends BuiltInComponentsFromContext(context)
  with AhcWSComponents with HttpFiltersComponents with CORSComponents with GzipFilterComponents {
  // first of all create the config for the service
  val config: Config = loadConfig(configuration)
  // next thing is to set up log shipping
  LogConfig.initKinesisLogging(config)
  LogConfig.initLocalLogShipping(config)

  override lazy val httpErrorHandler: HttpErrorHandler = new GridHttpErrorHandler(environment, configuration, sourceMapper,
    Some(router))

  def buildInfo: BuildInfo

  implicit val ec: ExecutionContext = executionContext

  final override def httpFilters: Seq[EssentialFilter] = {
    Seq(corsFilter, csrfFilter, securityHeadersFilter, gzipFilter, new RequestLoggingFilter(materializer), new RequestMetricFilter(config, materializer))
  }

  final override lazy val corsConfig: CORSConfig = CORSConfig.fromConfiguration(context.initialConfiguration).copy(
    allowedOrigins = Origins.Matching(Set(config.services.kahunaBaseUri, config.services.apiBaseUri) ++ config.services.corsAllowedDomains)
  )

  lazy val management = new Management(controllerComponents, buildInfo)
  val auth = new Authentication(config, actorSystem, defaultBodyParser, wsClient, controllerComponents, executionContext)
}

class GridHttpErrorHandler extends DefaultHttpErrorHandler with Results {
  override def onServerError(request: RequestHeader, exception: Throwable): Future[Result] = exception match {
    case e:UnexpectedException if e.cause.getClass.getCanonicalName == "akka.http.scaladsl.model.EntityStreamException" => {
      logger.info(s"Upload failed? Request = $request", e)
      Future.successful(UnprocessableEntity("The upload did not complete"))
    }
    case x => super.onServerError(request, x)
  }
}
