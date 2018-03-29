package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.auth.{Authentication, KeyStore}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.pandomainauth.PanDomainAuthSettingsRefresher
import com.typesafe.config.ConfigValueFactory
import play.api.ApplicationLoader.Context
import play.api.BuiltInComponentsFromContext
import play.api.libs.ws.ahc.AhcWSComponents

import scala.concurrent.ExecutionContext

abstract class GridComponents(context: Context) extends BuiltInComponentsFromContext(context)
  with AhcWSComponents {

  def config: CommonConfig

  implicit val ec: ExecutionContext = executionContext

  val configBucket: String = config.properties("s3.config.bucket")
  val keyStoreBucket: String = config.properties("auth.keystore.bucket")

  val keyStore = new KeyStore(keyStoreBucket, config.awsCredentials)

  val loginUriTemplate: String = config.services.loginUriTemplate
  val rootUri: String = config.services.authBaseUri
  val mediaApiUri: String = config.services.apiBaseUri
  val kahunaUri = config.services.kahunaBaseUri

  val panDomainSettings = new PanDomainAuthSettingsRefresher(
    domain = config.properties("panda.domain"),
    system = "media-service",
    actorSystem = actorSystem,
    awsCredentialsProvider = config.awsCredentials
  )

  val auth =
    new Authentication(keyStore, loginUriTemplate, rootUri, defaultBodyParser, wsClient, controllerComponents, panDomainSettings, executionContext)
}
