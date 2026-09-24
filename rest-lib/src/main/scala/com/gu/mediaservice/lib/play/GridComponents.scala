package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.auth.{Authentication, Authorisation}
import com.gu.mediaservice.lib.auth.provider.{AuthenticationProviderResources, AuthenticationProviders, AuthorisationProvider, AuthorisationProviderResources, InnerServiceAuthenticationProvider, MachineAuthenticationProvider, UserAuthenticationProvider}
import com.gu.mediaservice.lib.config.{ApiAuthenticationProviderLoader, AuthorisationProviderLoader, CommonConfig, GridConfigResources, UserAuthenticationProviderLoader}
import com.gu.mediaservice.lib.logging.LogConfig
import com.gu.mediaservice.lib.management.{BuildInfo, Management}
import play.api.ApplicationLoader.Context
import play.api.BuiltInComponentsFromContext
import play.api.http.HttpErrorHandler
import play.api.libs.ws.ahc.AhcWSComponents
import play.api.mvc.EssentialFilter
import play.filters.HttpFiltersComponents
import play.filters.cors.CORSConfig.Origins
import play.filters.cors.{CORSComponents, CORSConfig}
import play.filters.gzip.GzipFilterComponents

import scala.concurrent.ExecutionContext

abstract class GridComponents[Config <: CommonConfig](context: Context, val loadConfig: GridConfigResources => Config) extends BuiltInComponentsFromContext(context)
  with AhcWSComponents with HttpFiltersComponents with CORSComponents with GzipFilterComponents {
  // first of all create the config for the service
  val config: Config = loadConfig(GridConfigResources(configuration, actorSystem, applicationLifecycle))
  // next thing is to set up log shipping
  LogConfig.initKinesisLogging(config)
  LogConfig.initLocalLogShipping(config)

  def buildInfo: BuildInfo

  implicit val ec: ExecutionContext = executionContext

  // Before any filter or error handler can report. `buildInfo` is a subclass val, so this must be
  // lazy to avoid reading it during this constructor.
  private lazy val sentryInitialised: Unit =
    SentryInitialiser.init(config.sentryConfig, config.appName, buildInfo.gitCommitId)

  final override lazy val httpErrorHandler: HttpErrorHandler = {
    sentryInitialised
    new GridSentryErrorHandler(environment, configuration, devContext.map(_.sourceMapper), Some(router), config.sentryConfig)
  }

  final override def httpFilters: Seq[EssentialFilter] = {
    sentryInitialised
    Seq(
      corsFilter,
      csrfFilter,
      securityHeadersFilter,
      gzipFilter,
      new RequestLoggingFilter(materializer),
      // After RequestLoggingFilter so the request id is available to tag transactions with.
      new SentryTracingFilter(config.sentryConfig, materializer),
      new ConnectionBrokenFilter(materializer),
      new RequestMetricFilter(config, materializer, actorSystem, applicationLifecycle)
    )
  }

  final override lazy val corsConfig: CORSConfig = CORSConfig.fromConfiguration(context.initialConfiguration).copy(
    allowedOrigins = Origins.Matching(config.services.corsAllowedDomains)
  )

  lazy val management = new Management(controllerComponents, buildInfo)

  private val authorisationProviderResources = AuthorisationProviderResources(commonConfig = config, wsClient = wsClient)
  private val authorisationProvider: AuthorisationProvider = config.configuration.get[AuthorisationProvider]("authorisation.provider")(AuthorisationProviderLoader.singletonConfigLoader(authorisationProviderResources, applicationLifecycle))
  val authorisation = new Authorisation(authorisationProvider, executionContext)

  private val authProviderResources = AuthenticationProviderResources(
    commonConfig = config,
    actorSystem = actorSystem,
    wsClient = wsClient,
    controllerComponents = controllerComponents,
    authorisation = authorisation
  )

  protected val providers: AuthenticationProviders = AuthenticationProviders(
    userProvider = config.configuration.get[UserAuthenticationProvider]("authentication.providers.user")(UserAuthenticationProviderLoader.singletonConfigLoader(authProviderResources, applicationLifecycle)),
    apiProvider = config.configuration.get[MachineAuthenticationProvider]("authentication.providers.machine")(ApiAuthenticationProviderLoader.singletonConfigLoader(authProviderResources, applicationLifecycle)),
    innerServiceProvider = new InnerServiceAuthenticationProvider(cookieSigner, serviceName=config.appName)
  )

  val auth = new Authentication(config, providers, controllerComponents.parsers.default, executionContext)
}
