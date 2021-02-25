package com.gu.mediaservice.lib.auth.provider

import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.Permissions.{PrincipalFilter, VisibilityFilter}
import com.gu.mediaservice.lib.auth.{PermissionContext, PermissionWithParameter}
import com.gu.mediaservice.lib.config.{CommonConfig, Provider}
import play.api.libs.ws.WSClient

import scala.concurrent.Future

case class AuthorisationProviderResources(commonConfig: CommonConfig, wsClient: WSClient)

trait AuthorisationProvider extends Provider {
  /**
    * Any code to start this AuthorisationProvider should be placed here. This should block until the provider is in
    * a good state to check permissions.
    */
  def initialise(): Unit = {}

  /**
    * A method to gracefully shutdown this provider (e.g. shutdown scheduled refreshes of external data sources)
    * @return
    */
  def shutdown(): Future[Unit] = Future.successful(())

  /**
    * Test whether a principal has permission on this context. This is useful in code where you want to gate access for
    * principals.
    * @param permissionContext The permission context that should be evaluated for the principal
    * @param principal The principal (user or machine) that the context should be checked against
    * @tparam T If the permission context is parameterised then this will be the parameter type, otherwise Unit
    * @return true if the principal has permission, false otherwise
    */
  def hasPermissionTo[T](permissionContext: PermissionContext[T], principal: Principal): Boolean

  /**
    * Create a function that takes a permission parameter and returns true if the underlying principal has the
    * underlying permission for that parameter and false otherwise. Useful if you are filtering results by the given
    * parameter.
    * @param permission The permission to generate a function for
    * @param principal The principal to generate a function for
    * @tparam T The parameter type of the specified permission
    * @return A function from T => Boolean
    */
  def visibilityFilterFor[T](permission: PermissionWithParameter[T], principal: Principal): VisibilityFilter[T]
}
