package com.gu.mediaservice.lib.auth

import scala.concurrent.duration.DurationInt
import com.amazonaws.auth.BasicAWSCredentials
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
  override val apiGracePeriod = 1.hour.toMillis

  override lazy val domain: String = properties("panda.domain")
  lazy val awsKeyId                = properties.get("panda.aws.key")
  lazy val awsSecretAccessKey      = properties.get("panda.aws.secret")

  override lazy val awsCredentials = for (key <- awsKeyId; sec <- awsSecretAccessKey) yield {new BasicAWSCredentials(key, sec)}

  override val system: String = "media-service"
}
