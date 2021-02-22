package com.gu.mediaservice.lib.auth.provider

import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.Permissions.{PrincipalFilter, VisibilityFilter}
import com.gu.mediaservice.lib.auth.{PermissionWithParameter, SimplePermission}
import com.gu.mediaservice.lib.config.{CommonConfig, Provider}
import play.api.libs.ws.WSClient

import scala.concurrent.Future

case class AuthorisationProviderResources(commonConfig: CommonConfig, wsClient: WSClient)

trait AuthorisationProvider extends Provider {
  def initialise(): Unit = {}
  def shutdown(): Future[Unit] = Future.successful(())

  def hasPermissionTo[T](permission: SimplePermission): PrincipalFilter
  def hasPermissionTo[T](permission: PermissionWithParameter[T], parameter: T): PrincipalFilter
  def visibilityFilterFor[T](permission: PermissionWithParameter[T], principal: Principal): VisibilityFilter[T]
}
