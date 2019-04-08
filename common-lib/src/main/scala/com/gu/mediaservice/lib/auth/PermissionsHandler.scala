package com.gu.mediaservice.lib.auth

import com.amazonaws.auth.AWSCredentialsProvider
import com.gu.mediaservice.lib.auth.Authentication.{AuthenticatedService, PandaUser, Principal}
import com.gu.permissions.{PermissionDefinition, PermissionsConfig, PermissionsProvider}
import play.api.{Configuration, Logger}


object PermissionDeniedError extends Throwable("Permission denied")

trait PermissionsHandler {
  def storeIsEmpty: Boolean
  def hasPermission(user: Principal, permission: PermissionDefinition): Boolean
}

object PermissionsHandler {
  def build(config: Configuration, region: String, awsCredentials: AWSCredentialsProvider): PermissionsHandler = {
    config.getOptional[String]("permissions.stage") match {
      case Some(stage) =>
        new GuardianPermissionsHandler(stage, region, awsCredentials)

      // TODO MRB: permissions based on Cognito groups?
      case None =>
        Logger.warn("No permissions handler configured - granting all permissions")
        new GrantAllPermissionsHandler()
    }
  }
}

class GuardianPermissionsHandler(permissionsStage: String, region: String, awsCredentials: AWSCredentialsProvider) extends PermissionsHandler {
  private val permissions = PermissionsProvider(PermissionsConfig(permissionsStage, region, awsCredentials))

  def storeIsEmpty: Boolean = {
    permissions.storeIsEmpty
  }

  def hasPermission(user: Principal, permission: PermissionDefinition): Boolean = {
    user match {
      case PandaUser(u) => permissions.hasPermission(permission, u.email)
      // think about only allowing certain services i.e. on `service.name`?
      case service: AuthenticatedService if service.apiKey.tier == Internal => true
      case _ => false
    }
  }
}

class GrantAllPermissionsHandler extends PermissionsHandler {
  override def storeIsEmpty: Boolean = false
  override def hasPermission(user: Principal, permission: PermissionDefinition): Boolean = true
}
