package com.gu.mediaservice.lib.auth


import com.amazonaws.auth.{InstanceProfileCredentialsProvider, AWSCredentialsProviderChain, BasicAWSCredentials, AWSCredentials}
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.gu.pandomainauth.action.AuthActions
import com.gu.pandomainauth.model.AuthenticatedUser
import com.gu.mediaservice.lib.config.Properties
import scala.util.Try

trait PanDomainAuthActions extends AuthActions {

  lazy val properties = Properties.fromPath("/etc/gu/panda.properties")

  override def validateUser(authedUser: AuthenticatedUser): Boolean = {
    val oauthDomain:String = properties.getOrElse("panda.oauth.domain", "guardian.co.uk")
    val oauthDomainMultiFactorEnabled:Boolean = Try(properties("panda.oauth.multifactor.enable").toBoolean).getOrElse(true)
    // check if the user email domain is the one configured
    val isAuthorized:Boolean = (authedUser.user.emailDomain == oauthDomain)
    // if authorized check if multifactor is to be evaluated
    if (oauthDomainMultiFactorEnabled) isAuthorized && authedUser.multiFactor else isAuthorized
  }

  val authCallbackBaseUri: String

  override def authCallbackUrl: String = s"$authCallbackBaseUri/oauthCallback"

  override lazy val domain: String = properties("panda.domain")

  override def awsCredentialsProvider = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service"),
    new InstanceProfileCredentialsProvider
  )

  override val system: String = "media-service"
}
