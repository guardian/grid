package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.config.{InstanceForRequest, Services}
import com.gu.mediaservice.model.Instance
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc._

import java.net.URLEncoder
import scala.concurrent.Future

trait BaseControllerWithLoginRedirects extends BaseController with InstanceForRequest {
  def auth: Authentication
  def services: Services

  private def withLoginRedirectAsync(isLoginOptional: Boolean)(handler: Request[AnyContent] => Future[Result]): Action[AnyContent] = Action.async { request =>
    implicit val instance: Instance = instanceOf(request)
    // gracePeriodCountsAsAuthenticated=false here means that a user must have a fresh session (ie. not yet in grace period) if they turn up here to count as authenticated.
    // If login is optional then they may still be allowed access
    auth.authenticationStatus(request, gracePeriodCountsAsAuthenticated = false) match {
      case Right(principal) =>
        handler(new AuthenticatedRequest(principal, request))
      case Left(resultFuture) => auth.loginLinks().headOption match {
        case None if isLoginOptional => handler(request) // if login is not strictly required, then still perform the action (just the user principal won't be available)
        case None => resultFuture // if login is strictly required, then return the auth failure result
        case Some(loginLink) =>
          val returnTo = s"https://${request.domain}${request.uri}"
          Future.successful(Redirect(loginLink.href.replace(services.redirectUriPlaceholder,
            s"?${services.redirectUriParam}=${URLEncoder.encode(returnTo, "UTF-8")}")))
      }
    }
  }

  def withLoginRedirectAsync(handler: Request[AnyContent] => Future[Result]): Action[AnyContent] =
    withLoginRedirectAsync(isLoginOptional = false)(handler)
  def withOptionalLoginRedirectAsync(handler: Request[AnyContent] => Future[Result]): Action[AnyContent] =
    withLoginRedirectAsync(isLoginOptional = true)(handler)

  def withLoginRedirectAsync(handler: => Future[Result]): Action[AnyContent] = withLoginRedirectAsync(_ => handler)
  def withOptionalLoginRedirectAsync(handler: => Future[Result]): Action[AnyContent] = withOptionalLoginRedirectAsync(_ => handler)

  def withLoginRedirect(handler: Request[AnyContent] => Result): Action[AnyContent] = withLoginRedirectAsync(request => Future.successful(handler(request)))
  def withOptionalLoginRedirect(handler: Request[AnyContent] => Result): Action[AnyContent] = withOptionalLoginRedirectAsync(request => Future.successful(handler(request)))

  def withLoginRedirect(handler: => Result): Action[AnyContent] = withLoginRedirect(_ => handler)
  def withOptionalLoginRedirect(handler: => Result): Action[AnyContent] = withOptionalLoginRedirect(_ => handler)
}
