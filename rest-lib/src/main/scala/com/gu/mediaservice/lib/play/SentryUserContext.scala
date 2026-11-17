package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.auth.Authentication.{Principal, UserPrincipal}
import play.api.http.HttpRequestHandler
import play.api.libs.typedmap.TypedKey
import play.api.mvc.{Handler, RequestHeader}

import java.util.concurrent.atomic.AtomicReference

object SentryUserContext {
  private val emailKey = TypedKey[AtomicReference[Option[String]]]("sentry-user-email")

  private[play] def withContext(request: RequestHeader): RequestHeader =
    request.addAttr(emailKey, new AtomicReference[Option[String]](None))

  def recordAuthenticatedPrincipal(request: RequestHeader, principal: Principal): Unit =
    request.attrs.get(emailKey).foreach { email =>
      email.set(principal match {
        case user: UserPrincipal if user.email.nonEmpty => Some(user.email)
        case _ => None
      })
    }

  private[play] def emailFor(request: RequestHeader): Option[String] =
    request.attrs.get(emailKey).flatMap(_.get())
}

/** Makes authenticated identity available on the request retained by Play for error recovery. */
class SentryUserRequestHandler(delegate: HttpRequestHandler) extends HttpRequestHandler {
  override def handlerForRequest(request: RequestHeader): (RequestHeader, Handler) =
    delegate.handlerForRequest(SentryUserContext.withContext(request))
}
