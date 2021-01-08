package com.gu.mediaservice.lib.auth.provider
import com.gu.mediaservice.lib.auth.Authentication.{ApiKeyAccessor, Principal}
import com.gu.mediaservice.lib.auth.{ApiAccessor, KeyStore}
import com.typesafe.scalalogging.StrictLogging
import play.api.libs.typedmap.{TypedEntry, TypedKey, TypedMap}
import play.api.libs.ws.WSRequest
import play.api.mvc.RequestHeader

object ApiKeyAuthenticationProvider {
  val apiKeyHeaderName = "X-Gu-Media-Key"
}

class ApiKeyAuthenticationProvider(resources: AuthenticationProviderResources) extends ApiAuthenticationProvider with StrictLogging {
  val ApiKeyHeader: TypedKey[(String, String)] = TypedKey[(String, String)]("ApiKeyHeader")

  var keyStorePlaceholder: Option[KeyStore] = _

  // TODO: we should also shutdown the keystore but there isn't currently a hook
  override def initialise(): Unit = {
    val store = new KeyStore(resources.config.get[String]("authKeyStoreBucket"), resources.commonConfig)(resources.context)
    store.scheduleUpdates(resources.actorSystem.scheduler)
    keyStorePlaceholder = Some(store)
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
            val header = TypedEntry(ApiKeyHeader, ApiKeyAuthenticationProvider.apiKeyHeaderName -> key)
            val accessor = ApiKeyAccessor(apiKey, TypedMap(header))
            logger.info(s"Using api key with name ${apiKey.identity} and tier ${apiKey.tier}", apiKey)
            if (ApiAccessor.hasAccess(apiKey, request, resources.commonConfig.services)) {
              // valid api key which has access
              Authenticated(accessor)
            } else {
              // valid api key which doesn't have access
              NotAuthorised("API key valid but not authorised")
            }
          // provided api key not known
          case None => Invalid("API key not valid")
        }
      // no api key found
      case None => NotAuthenticated
    }
  }

  /**
    * A function that allows downstream API calls to be made using the credentials of the inflight request
    *
    * @param request The request header of the inflight call
    * @return A function that adds appropriate data to a WSRequest
    */
  override def onBehalfOf(principal: Principal): Either[String, WSRequest => WSRequest] = {
    principal.attributes.get(ApiKeyHeader) match {
      case Some(apiKeyHeaderTuple) => Right {
        wsRequest: WSRequest => wsRequest.addHttpHeaders(apiKeyHeaderTuple)
      }
      case None => Left(s"API key not found in request, no header ${ApiKeyAuthenticationProvider.apiKeyHeaderName}")
    }
  }
}
