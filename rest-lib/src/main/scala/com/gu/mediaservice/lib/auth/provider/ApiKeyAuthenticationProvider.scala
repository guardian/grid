package com.gu.mediaservice.lib.auth.provider
import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, Principal}
import com.gu.mediaservice.lib.auth.provider.ApiKeyAuthenticationProvider.{ApiKeyInstance, KindeIdKey}
import com.gu.mediaservice.lib.auth.{ApiAccessor, KeyStore}
import com.gu.mediaservice.lib.aws.{S3, S3Bucket}
import com.gu.mediaservice.lib.config.InstanceForRequest
import com.gu.mediaservice.lib.events.UsageEvents
import com.gu.mediaservice.model.Instance
import com.typesafe.scalalogging.StrictLogging
import play.api.Configuration
import play.api.libs.typedmap.{TypedEntry, TypedKey, TypedMap}
import play.api.libs.ws.WSRequest
import play.api.mvc.RequestHeader

import scala.concurrent.{ExecutionContext, Future}

object ApiKeyAuthenticationProvider extends ApiKeyAuthentication {
  val ApiKeyHeader: TypedKey[(String, String)] = TypedKey[(String, String)]("ApiKeyHeader")
  val KindeIdKey: TypedKey[String] = TypedKey[String]("kinde_id")
  val ApiKeyInstance: TypedKey[String] = TypedKey[String]("apikey_instance")
}

class ApiKeyAuthenticationProvider(configuration: Configuration, resources: AuthenticationProviderResources) extends MachineAuthenticationProvider with StrictLogging
  with InstanceForRequest {
  implicit val executionContext: ExecutionContext = resources.controllerComponents.executionContext
  var keyStorePlaceholder: Option[KeyStore] = _

  override def initialise(): Unit = {
    val authKeyStoreBucket  = S3Bucket(configuration.get[String]("authKeyStoreBucket"), S3.AmazonAwsS3Endpoint)
    val store = new KeyStore(authKeyStoreBucket, resources.commonConfig)
    store.scheduleUpdates(resources.actorSystem.scheduler)
    keyStorePlaceholder = Some(store)
  }

  override def shutdown(): Future[Unit] = Future {
    keyStorePlaceholder.foreach(_.stopUpdates())
  }

  def keyStore: KeyStore = keyStorePlaceholder.getOrElse(throw new IllegalStateException("Not initialised"))

  /**
    * Establish the authentication status of the given request header. This can return an authenticated user or a number
    * of reasons why a user is not authenticated.
    *
    * @param request The request header containing cookies and other request headers that can be used to establish the
    *           authentication status of a request.
    * @return An authentication status expressing whether the
    */
  override def authenticateRequest(request: RequestHeader): ApiAuthenticationStatus = {
    implicit val instance: Instance = instanceOf(request)
    request.headers.get(ApiKeyAuthenticationProvider.apiKeyHeaderName) match {
      case Some(key) =>
        keyStore.lookupIdentity(key) match {
          // api key provided
          case Some(apiAccessor) =>
            // valid api key
            if (ApiAccessor.hasAccess(apiAccessor, request, resources.commonConfig.services)) {
              val apiKeyInstanceAttribute = TypedEntry[String](ApiKeyInstance, instance.id)
              val attributes = TypedMap(ApiKeyAuthenticationProvider.ApiKeyHeader -> (ApiKeyAuthenticationProvider.apiKeyHeaderName -> key)).updated(apiKeyInstanceAttribute)
              // valid api key which has access
              // store the header that was used in the attributes map of the principal for use in onBehalfOf calls
              val accessor = MachinePrincipal(apiAccessor, attributes)
              logger.info(s"Using api key with name ${apiAccessor.identity} and tier ${apiAccessor.tier}", apiAccessor)
              resources.events.apiKeyUsed(instance = instance, apiKey = apiAccessor.identity)
              Authenticated(accessor)
            } else {
              // valid api key which doesn't have access
              NotAuthorised(s"API key ${apiAccessor.identity} valid but not authorised for this request")
            }
          // provided api key not known
          case None => Invalid("API key not valid")
        }
      // no api key found
      case None => NotAuthenticated
    }
  }

  override def onBehalfOf(principal: Principal): Either[String, WSRequest => WSRequest] = {
    principal.attributes.get(ApiKeyAuthenticationProvider.ApiKeyHeader) match {
      case Some(apiKeyHeaderTuple) => Right {
        wsRequest: WSRequest => wsRequest.addHttpHeaders(apiKeyHeaderTuple)
      }
      case None => Left(s"API key not found in request, no header ${ApiKeyAuthenticationProvider.apiKeyHeaderName}")
    }
  }
}
