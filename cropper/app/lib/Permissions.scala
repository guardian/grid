package lib

import lib.Permissions._

import scala.concurrent.{ExecutionContext, Future}
import com.gu.mediaservice.lib.auth._


object PermissionDeniedError extends Throwable("Permission denied")

object Permissions {
  val failFuture = Future.failed(PermissionDeniedError)
  val permissionStore = new PermissionStore(Config.configBucket, Config.awsCredentials)

  def validateUserWithPermissions(user: Principal, permission: PermissionType.PermissionType)
                                 (implicit ec: ExecutionContext): Future[Principal] =
    getPermissionValForUser(permission, user) flatMap {
      case true  => Future.successful(user)
      case false => failFuture
    }

  def getPermissionValForUser(permission: PermissionType.PermissionType, user: Principal): Future[Boolean] = {
    user match {
      case u: PandaUser => {
        permissionStore.hasPermission(permission, u.email)
      }
      // think about only allowing certain services i.e. on `service.name`?
      case service: AuthenticatedService => Future.successful(true)
      case _ => Future.successful(false)
    }
  }
}

// Creating as a seperate object as I want to move ^
// to common to use across projects
object CropperPermissions {
  def validateUserCanDeleteCrops(user: Principal)(implicit ex: ExecutionContext) =
    validateUserWithPermissions(user, PermissionType.DeleteCrops)

  def canUserDeleteCrops(user: Principal)(implicit ex: ExecutionContext) =
    getPermissionValForUser(PermissionType.DeleteCrops, user)
}
