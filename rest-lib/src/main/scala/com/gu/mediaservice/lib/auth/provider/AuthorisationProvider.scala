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
    * Create a function that takes a principal and returns true if the principal has permission on this context
    * and false otherwise. This is useful in code where you want to gate access for principals.
    * @param permissionContext The permission context that the function should evaluate for principals
    * @tparam T If the permission context is parameterised then this will be the parameter type, otherwise Unit
    * @return A function from Principal => Boolean
    */
  def hasPermissionTo[T](permissionContext: PermissionContext[T]): PrincipalFilter

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
