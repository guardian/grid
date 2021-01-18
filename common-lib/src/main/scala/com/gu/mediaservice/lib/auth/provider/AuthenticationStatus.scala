package com.gu.mediaservice.lib.auth.provider

import com.gu.mediaservice.lib.auth.Authentication.{UserPrincipal, Principal}

// statuses that directly extend this are for users only
/** Status of a client's authentication */
sealed trait AuthenticationStatus

/** User authentication is valid but expired */
case class Expired(authedUser: UserPrincipal) extends AuthenticationStatus

// statuses that extend this can be used by both users and machines
/** Status of an API client's authentication */
sealed trait ApiAuthenticationStatus extends AuthenticationStatus

/** User authentication is valid */
case class Authenticated(authedUser: Principal) extends ApiAuthenticationStatus
/** User authentication is OK but the user is not authorised to use this system - might be a group or 2FA check failure */
case class NotAuthorised(message: String) extends ApiAuthenticationStatus
/** User authentication token or key (cookie, header, query param) exists but isn't valid -
  * the message and exception will be logged but not leaked to user */
case class Invalid(message: String, throwable: Option[Throwable] = None) extends ApiAuthenticationStatus
/** User authentication token doesn't exist */
case object NotAuthenticated extends ApiAuthenticationStatus

