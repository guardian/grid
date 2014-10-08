package com.gu.mediaservice.lib.auth

import com.gu.pandomainauth.action.AuthActions
import com.gu.pandomainauth.model.AuthenticatedUser

import com.gu.mediaservice.lib.config.Properties

trait PanDomainAuthActions extends AuthActions {

  lazy val properties = Properties.fromPath("/etc/gu/panda.properties")

  override def validateUser(authedUser: AuthenticatedUser): Boolean = {
    (authedUser.user.emailDomain == "guardian.co.uk") && authedUser.multiFactor
  }

  val authCallbackBaseUri: String

  override def authCallbackUrl: String = s"$authCallbackBaseUri/oauthCallback"

  override lazy val domain: String             = properties("panda.domain")
  override lazy val awsKeyId: String           = properties("panda.aws.keyId")
  override lazy val awsSecretAccessKey: String = properties("panda.aws.secret")

  override val system: String = "media-service"
}
