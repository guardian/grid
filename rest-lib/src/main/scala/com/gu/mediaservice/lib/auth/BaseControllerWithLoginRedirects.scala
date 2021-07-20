package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.config.Services
import play.api.mvc.{Action, AnyContent, BaseController, RequestHeader, Result}

import java.net.URLEncoder
import scala.concurrent.Future

trait BaseControllerWithLoginRedirects extends BaseController {
  def auth: Authentication
  def services: Services

  def withLoginRedirectAsync(handler: RequestHeader => Future[Result]): Action[AnyContent] = Action.async { request =>
    auth.authenticationStatus(request) match {
      case Left(resultFuture) => auth.loginLinks.headOption.map(link => {
        val returnTo = s"https://${request.domain}${request.uri}"
        Future.successful(Redirect(link.href.replace(services.redirectUriPlaceholder,
          s"?${services.redirectUriParam}=${URLEncoder.encode(returnTo, "UTF-8")}")))
      }).getOrElse(resultFuture)
      case Right(_) => handler(request)
    }
  }

  def withLoginRedirectAsync(handler: => Future[Result]): Action[AnyContent] = withLoginRedirectAsync(_ => handler)

  def withLoginRedirect(handler: RequestHeader => Result): Action[AnyContent] = withLoginRedirectAsync(request => Future.successful(handler(request)))

  def withLoginRedirect(handler: => Result): Action[AnyContent] = withLoginRedirect(_ => handler)
}
