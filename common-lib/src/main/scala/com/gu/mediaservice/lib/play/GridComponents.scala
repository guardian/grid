package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.config.CommonConfig
import play.api.ApplicationLoader.Context
import play.api.BuiltInComponentsFromContext
import play.api.libs.ws.ahc.AhcWSComponents

import scala.concurrent.ExecutionContext

abstract class GridComponents(context: Context) extends BuiltInComponentsFromContext(context)
  with AhcWSComponents {

  def config: CommonConfig

  implicit val ec: ExecutionContext = executionContext

  val loginUriTemplate: String = config.services.loginUriTemplate
  val rootUri: String = config.services.authBaseUri
  val mediaApiUri: String = config.services.apiBaseUri
  val kahunaUri = config.services.kahunaBaseUri

  val auth = new Authentication(loginUriTemplate, rootUri, config, actorSystem, defaultBodyParser, wsClient, controllerComponents, executionContext)
}
