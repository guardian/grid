package com.gu.mediaservice.lib.auth

import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.internal.StaticCredentialsProvider
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

  override lazy val domain: String = properties("panda.domain")
  lazy val awsKeyId                = properties("panda.aws.key")
  lazy val awsSecretAccessKey      = properties("panda.aws.secret")

  override def awsCredentialsProvider = new StaticCredentialsProvider(
    new BasicAWSCredentials(awsKeyId, awsSecretAccessKey)
  )

  override val system: String = "media-service"
}
