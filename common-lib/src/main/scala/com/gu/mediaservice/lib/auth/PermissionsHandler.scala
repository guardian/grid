package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, UserPrincipal, Principal}
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.permissions._

import scala.concurrent.duration._

object PermissionDeniedError extends Throwable("Permission denied")

trait PermissionsHandler {
  def config: CommonConfig

  private val permissions: PermissionsProvider = config.awsLocalEndpoint match {
    case Some(_) if config.isDev && config.useLocalAuth => {
      val provider = new S3PermissionsProvider(config.permissionsBucket, "permissions.json", 1.minute, PermissionsS3(S3Ops.buildS3Client(config)))
      provider.start()
      provider
    }
    case _ => {
      val permissionsStage = if(config.isProd) { "PROD" } else { "CODE" }
      PermissionsProvider(PermissionsConfig(permissionsStage, config.awsRegion, config.awsCredentials, config.permissionsBucket))
    }
  }

  def storeIsEmpty: Boolean = {
    permissions.storeIsEmpty
  }

  def hasPermission(user: Principal, permission: PermissionDefinition): Boolean = {
    user match {
      case UserPrincipal(_, _, email, _) => permissions.hasPermission(permission, email)
      // think about only allowing certain services i.e. on `service.name`?
      case service: MachinePrincipal if service.accessor.tier == Internal => true
      case _ => false
    }
  }
}
