package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.auth.Authentication.{AuthenticatedService, PandaUser, Principal}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.permissions.{PermissionDefinition, PermissionsConfig, PermissionsProvider}
import org.slf4j.LoggerFactory


object PermissionDeniedError extends Throwable("Permission denied")

trait PermissionsHandler {
  def config: CommonConfig

  private lazy val log = LoggerFactory.getLogger(getClass)
  private val permissions = PermissionsProvider(PermissionsConfig(config.stage, config.awsRegion, config.awsCredentials))

  def hasPermission(user: Principal, permission: PermissionDefinition): Boolean = {
    user match {
      case PandaUser(u) => permissions.hasPermission(permission, u.email)
      // think about only allowing certain services i.e. on `service.name`?
      case AuthenticatedService(_) => true
      case _ => false
    }
  }
}
