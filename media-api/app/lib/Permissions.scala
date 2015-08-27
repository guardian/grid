package lib

import com.gu.mediaservice.lib.auth.{PermissionType, Principal, PermissionsHandler, PermissionStore}

import scala.concurrent.ExecutionContext

object Permissions extends PermissionsHandler {
  val permissionStore = new PermissionStore(Config.configBucket, Config.awsCredentials)

  def canUserDeleteCrops(user: Principal)(implicit ex: ExecutionContext) =
    getPermissionValForUser(PermissionType.DeleteCrops, user)
}
