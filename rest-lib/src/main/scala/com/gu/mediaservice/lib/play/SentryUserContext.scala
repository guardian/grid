package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.auth.Authentication.{Principal, UserPrincipal}
import com.gu.mediaservice.lib.config.{SentryConfig, SentryUserIdentity}
import play.api.http.HttpRequestHandler
import play.api.libs.typedmap.TypedKey
import play.api.mvc.{Handler, RequestHeader}

import java.util.concurrent.atomic.AtomicReference

object SentryUserContext {
  private case class Context(config: SentryConfig, identity: AtomicReference[Option[SentryUserIdentity]])
  private val identityKey = TypedKey[Context]("sentry-user-identity")

  private[play] def withContext(request: RequestHeader, config: SentryConfig): RequestHeader =
    request.addAttr(identityKey, Context(config, new AtomicReference[Option[SentryUserIdentity]](None)))

  def identityForPrincipal(config: SentryConfig, principal: Principal): Option[SentryUserIdentity] =
    principal match {
      case user: UserPrincipal => config.userIdentity(user.email, isEmail = true)
      case other => config.userIdentity(other.accessor.identity, isEmail = false)
    }

  def recordAuthenticatedPrincipal(request: RequestHeader, principal: Principal): Unit =
    request.attrs.get(identityKey).foreach { context =>
      context.identity.set(identityForPrincipal(context.config, principal))
    }

  private[play] def identityFor(request: RequestHeader): Option[SentryUserIdentity] =
    request.attrs.get(identityKey).flatMap(_.identity.get())
}

/** Makes authenticated identity available on the request retained by Play for error recovery. */
class SentryUserRequestHandler(delegate: HttpRequestHandler, config: SentryConfig) extends HttpRequestHandler {
  override def handlerForRequest(request: RequestHeader): (RequestHeader, Handler) =
    delegate.handlerForRequest(SentryUserContext.withContext(request, config))
}
