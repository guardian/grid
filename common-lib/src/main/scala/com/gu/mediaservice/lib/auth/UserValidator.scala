package com.gu.mediaservice.lib.auth

import com.gu.pandomainauth.model.AuthenticatedUser
import com.gu.pandomainauth.service.Google2FAGroupChecker

trait UserValidator {
  def validateUser(authedUser: AuthenticatedUser, maybeMultiFactorChecker: Option[Google2FAGroupChecker]): Boolean
}
