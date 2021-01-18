package com.gu.mediaservice.lib.auth.provider
import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, Principal}
import com.gu.mediaservice.lib.auth.{ApiAccessor, KeyStore}
import com.typesafe.scalalogging.StrictLogging
import play.api.Configuration
import play.api.libs.typedmap.{TypedKey, TypedMap}
import play.api.libs.ws.WSRequest
import play.api.mvc.RequestHeader

import scala.concurrent.{ExecutionContext, Future}

object ApiKeyAuthenticationProvider {
  val ApiKeyHeader: TypedKey[(String, String)] = TypedKey[(String, String)]("ApiKeyHeader")
  val apiKeyHeaderName = "X-Gu-Media-Key"
}

class ApiKeyAuthenticationProvider(configuration: Configuration, resources: AuthenticationProviderResources) extends MachineAuthenticationProvider with StrictLogging {
  implicit val executionContext: ExecutionContext = resources.controllerComponents.executionContext
  var keyStorePlaceholder: Option[KeyStore] = _

  override def initialise(): Unit = {
    val store = new KeyStore(configuration.get[String]("authKeyStoreBucket"), resources.commonConfig)
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
    request.headers.get(ApiKeyAuthenticationProvider.apiKeyHeaderName) match {
      case Some(key) =>
        keyStore.lookupIdentity(key) match {
          // api key provided
          case Some(apiKey) =>
            // valid api key
            if (ApiAccessor.hasAccess(apiKey, request, resources.commonConfig.services)) {
              // valid api key which has access
              // store the header that was used in the attributes map of the principal for use in onBehalfOf calls
              val accessor = MachinePrincipal(apiKey, TypedMap(ApiKeyAuthenticationProvider.ApiKeyHeader -> (ApiKeyAuthenticationProvider.apiKeyHeaderName -> key)))
              logger.info(s"Using api key with name ${apiKey.identity} and tier ${apiKey.tier}", apiKey)
              Authenticated(accessor)
            } else {
              // valid api key which doesn't have access
              NotAuthorised(s"API key ${apiKey.identity} valid but not authorised for this request")
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
