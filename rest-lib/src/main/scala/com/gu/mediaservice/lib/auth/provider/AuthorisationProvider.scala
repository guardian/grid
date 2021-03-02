package com.gu.mediaservice.lib.auth.provider

import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.SimplePermission
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
    * Test whether a principal has this permission. This is useful in code where you want to gate access for
    * principals.
    * @param permission The permission that should be evaluated for the principal
    * @param principal The principal (user or machine) that should be checked
    * @return true if the principal has permission, false otherwise
    */
  def hasPermissionTo(permission: SimplePermission, principal: Principal): Boolean
}
