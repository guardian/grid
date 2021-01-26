package com.gu.mediaservice.lib.auth.provider

import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.Permissions.{VisibilityFilter, PrincipalFilter}
import com.gu.mediaservice.lib.auth.{PermissionWithParameter, SimplePermission}
import com.gu.mediaservice.lib.config.CommonConfig
import play.api.libs.ws.WSClient

case class AuthorisationProviderResources(commonConfig: CommonConfig, wsClient: WSClient)

trait AuthorisationProvider {
  def isReady(): Boolean
  def hasPermissionTo[T](permission: SimplePermission): PrincipalFilter
  def hasPermissionTo[T](permission: PermissionWithParameter[T], parameter: T): PrincipalFilter
  def visibilityFilterFor[T](permission: PermissionWithParameter[T], principal: Principal): VisibilityFilter[T]
}
