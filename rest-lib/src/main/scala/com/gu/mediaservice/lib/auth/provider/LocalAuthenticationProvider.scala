package com.gu.mediaservice.lib.auth.provider

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.UserPrincipal
import com.gu.mediaservice.lib.auth.provider.AuthenticationProvider.RedirectUri
import com.gu.mediaservice.lib.config.InstanceForRequest
import com.gu.mediaservice.model.Instance
import com.typesafe.scalalogging.StrictLogging
import play.api.http.HeaderNames
import play.api.libs.ws.WSRequest
import play.api.mvc.{RequestHeader, Result}

import scala.concurrent.{ExecutionContext, Future}


class LocalAuthenticationProvider (resources: AuthenticationProviderResources)
  extends UserAuthenticationProvider with StrictLogging with ArgoHelpers with HeaderNames with InstanceForRequest {
  logger.warn("Authentication set to local, every user will be authenticated")

  implicit val ec: ExecutionContext = resources.controllerComponents.executionContext
  private def kahunaBaseURI: Instance => RedirectUri = resources.commonConfig.services.kahunaBaseUri

  override def authenticateRequest(request: RequestHeader): AuthenticationStatus = {
    Authenticated(UserPrincipal("John", "Doe", "johndoe@example.com"))
  }

  override def sendForAuthentication: Option[RequestHeader => Future[Result]] = Some({requestHeader: RequestHeader =>
    implicit val instance: Instance = instanceOf(requestHeader)
    Future(redirectToSource(requestHeader)(instance))
  })

  override def sendForAuthenticationCallback: Option[(RequestHeader, Option[RedirectUri]) => Future[Result]] = None

  override def flushToken: Option[(RequestHeader, Result) => Result] = None

  override def onBehalfOf(request: Authentication.Principal): Either[String, WSRequest => WSRequest] = {
    Right { identity }
  }

  private def redirectToSource(request: RequestHeader)(implicit instance: Instance): Result = {
    request.getQueryString("redirectUri").map(redirectURL => Redirect(redirectURL)).getOrElse(Redirect(kahunaBaseURI(instance)))
  }
}

