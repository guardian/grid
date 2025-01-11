package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.auth.{Authentication, Authorisation}
import com.gu.mediaservice.lib.auth.provider.{AuthenticationProviderResources, AuthenticationProviders, AuthorisationProvider, AuthorisationProviderResources, InnerServiceAuthenticationProvider, MachineAuthenticationProvider, UserAuthenticationProvider}
import com.gu.mediaservice.lib.config.{ApiAuthenticationProviderLoader, AuthorisationProviderLoader, CommonConfig, GridConfigResources, UserAuthenticationProviderLoader}
import com.gu.mediaservice.lib.events.UsageEvents
import com.gu.mediaservice.lib.logging.LogConfig
import com.gu.mediaservice.lib.management.{BuildInfo, Management}
import play.api.ApplicationLoader.Context
import play.api.BuiltInComponentsFromContext
import play.api.libs.ws.ahc.AhcWSComponents
import play.api.mvc.EssentialFilter
import play.filters.HttpFiltersComponents
import play.filters.cors.CORSConfig.Origins
import play.filters.cors.{CORSComponents, CORSConfig}
import play.filters.gzip.GzipFilterComponents
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest

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
  protected val instanceSpecificCorsFilter = new InstanceSpecificCORSFilter(config, context.initialConfiguration)


  override def httpFilters: Seq[EssentialFilter] = Seq(
      instanceSpecificCorsFilter,
    // csrfFilter,  TODO Ineffective as gateway is not setting correct hostname headers!
      securityHeadersFilter, // TODO needs to be replemented to be request/instance specfic
      gzipFilter,
      new RequestLoggingFilter(materializer),
      new ConnectionBrokenFilter(materializer),
      new RequestMetricFilter(config, materializer, actorSystem, applicationLifecycle)
    )

  lazy val management = new Management(controllerComponents, buildInfo)

  private val authorisationProviderResources = AuthorisationProviderResources(commonConfig = config, wsClient = wsClient)
  private val authorisationProvider: AuthorisationProvider = config.configuration.get[AuthorisationProvider]("authorisation.provider")(AuthorisationProviderLoader.singletonConfigLoader(authorisationProviderResources, applicationLifecycle))
  val authorisation = new Authorisation(authorisationProvider, executionContext)

  private val sqsClient: SqsClient = SqsClient.builder()
    .region(Region.EU_WEST_1)
    .build()

  private val usageEventsQueueUrl: String = {
    val getQueueRequest = GetQueueUrlRequest.builder()
      .queueName(config.usageEventsQueueName)
      .build()
    sqsClient.getQueueUrl(getQueueRequest).queueUrl
  }
  val events = new UsageEvents(actorSystem, applicationLifecycle, sqsClient, usageEventsQueueUrl)

  private val authProviderResources = AuthenticationProviderResources(
    commonConfig = config,
    actorSystem = actorSystem,
    wsClient = wsClient,
    controllerComponents = controllerComponents,
    authorisation = authorisation,
    cookieSigner = cookieSigner,
    events = events
  )

  protected val providers: AuthenticationProviders = AuthenticationProviders(
    userProvider = config.configuration.get[UserAuthenticationProvider]("authentication.providers.user")(UserAuthenticationProviderLoader.singletonConfigLoader(authProviderResources, applicationLifecycle)),
    apiProvider = config.configuration.get[MachineAuthenticationProvider]("authentication.providers.machine")(ApiAuthenticationProviderLoader.singletonConfigLoader(authProviderResources, applicationLifecycle)),
    innerServiceProvider = new InnerServiceAuthenticationProvider(cookieSigner, serviceName=config.appName)
  )

  val auth = new Authentication(config, providers, wsClient, controllerComponents.parsers.default, executionContext)
}
