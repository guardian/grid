package com.gu.mediaservice.lib.auth.provider

import akka.actor.ActorSystem
import com.gu.mediaservice.lib.auth.Authentication.{InnerServicePrincipal, Principal}
import com.gu.mediaservice.lib.auth.provider.AuthenticationProvider.RedirectUri
import com.gu.mediaservice.lib.config.{CommonConfig, Provider}
import play.api.libs.crypto.CookieSigner
import play.api.libs.ws.{WSClient, WSRequest}
import play.api.mvc.{ControllerComponents, RequestHeader, Result}

import scala.concurrent.Future

/**
  * Case class containing useful resources for authentication providers to allow concurrent processing and external
  * API calls to be conducted.
  * @param commonConfig the Grid common config object
  * @param actorSystem an actor system
  * @param wsClient a play WSClient for making API calls
  * @param controllerComponents play components, including the execution context for example
  */
case class AuthenticationProviderResources(commonConfig: CommonConfig,
                                           actorSystem: ActorSystem,
                                           wsClient: WSClient,
                                           controllerComponents: ControllerComponents)

sealed trait LoginLink
case object BuiltInAuthService extends LoginLink
case object DisableLoginLink extends LoginLink
case class ExternalLoginLink(link: String) extends LoginLink

sealed trait AuthenticationProvider extends Provider {
  def initialise(): Unit = {}
  def shutdown(): Future[Unit] = Future.successful(())

  /**
    * A function that allows downstream API calls to be made using the credentials of the current principal.
    * It is recommended that any data required for this downstream request enrichment is put into the principal's
    * attribute map when the principal is created in the authenticateRequest call.
    * @param principal The principal for the current request
    * @return Either a function that adds appropriate authentication headers to a WSRequest or an error string explaining
    *         why it wasn't possible to create a function.
    */
  def onBehalfOf(principal: Principal): Either[String, WSRequest => WSRequest]
}

object AuthenticationProvider {
  type RedirectUri = String
}

trait UserAuthenticationProvider extends AuthenticationProvider {
  /**
    * Establish the authentication status of the given request header. This can return an authenticated user or a number
    * of reasons why a user is not authenticated.
    * @param request The request header containing cookies and other request headers that can be used to establish the
    *           authentication status of a request.
    * @return An authentication status expressing whether the
    */
  def authenticateRequest(request: RequestHeader): AuthenticationStatus

  /**
    * If this provider supports sending a user that is not authorised to a federated auth provider then it should
    * provide a function here to redirect the user. The function signature takes the the request and returns a result
    * which is likely a redirect to an external authentication system.
    */
  def sendForAuthentication: Option[RequestHeader => Future[Result]]

  /**
    * If this provider supports sending a user that is not authorised to a federated auth provider then it should
    * provide a function here that deals with the return of a user from a federated provider. This should be
    * used to set a cookie or similar to ensure that a subsequent call to authenticateRequest will succeed. If
    * authentication failed then this should return an appropriate 4xx result.
    * The function should take the Play request header and the redirect URI that the user should be
    * sent to on successful completion of the authentication.
    */
  def sendForAuthenticationCallback: Option[(RequestHeader, Option[RedirectUri]) => Future[Result]]

  /**
    * If this provider is able to clear user tokens (i.e. by clearing cookies) then it should provide a function to
    * do that here which will be used to log users out and also if the token is invalid.
    * This function takes the request header and a result to modify and returns the modified result.
    */
  def flushToken: Option[(RequestHeader, Result) => Result]

  /**
    * The login link is provided to the client to tell them where to go if they are
    * not authenticated. By default the Grid provides a link to the authentication
    * microservice but this behaviour can be modified. If it is not possible to login
    * or authentication is handled by a proxy you can set this to DisableLoginLink.
    * Alternatively if you are using an alternative external service to do authentication
    * then this can be explicitly set to an alternative URL using ExternalLoginLink.
    */
  def loginLink: LoginLink = BuiltInAuthService
}

trait MachineAuthenticationProvider extends AuthenticationProvider {
  /**
    * Establish the authentication status of the given request header. This can return an authenticated user or a number
    * of reasons why a user is not authenticated.
    * @param request The request header containing cookies and other request headers that can be used to establish the
    *           authentication status of a request.
    * @return An authentication status expressing whether the
    */
  def authenticateRequest(request: RequestHeader): ApiAuthenticationStatus
}

class InnerServiceAuthenticationProvider(val signer: CookieSigner, val serviceName: String) extends AuthenticationProvider with InnerServiceAuthentication {

  override def onBehalfOf(principal: Principal): Either[String, WSRequest => WSRequest] = principal match {
    case innerServicePrincipal: InnerServicePrincipal => Right{
      wsRequest: WSRequest => signRequest(wsRequest, s"${innerServicePrincipal.accessor.identity} via ")
    }
    case _ => Left(s"InnerServiceAuthenticationProvider cannot make requests 'onBehalfOf' a ${principal.getClass.toString}")
  }

  def authenticateRequest(request: RequestHeader): ApiAuthenticationStatus = {
    request.headers.get(innerServiceSignatureHeaderName).map(verifyRequest(request)) match {
      case Some(Right(principal)) => Authenticated(principal)
      case Some(Left(invalidMessage)) => Invalid(invalidMessage)
      case None => NotAuthenticated
    }
  }
}
