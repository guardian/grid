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
    user match {
      case u: PandaUser => {
        permissionStore.hasPermission(permission, u.email) flatMap { hasPermission =>
          if (hasPermission) {
            Future.successful(u)
          } else {
            failFuture
          }
        }
      }
      // think about only allowing certain services i.e. on `service.name`?
      case service: AuthenticatedService => Future.successful(service)
      case _ => failFuture
    }
}

// Creating as a seperate object as I want to move ^
// to common to use across projects
object CropperPermissions {
  def validateUserCanDeleteCrops(user: Principal)(implicit ec: ExecutionContext) =
    validateUserWithPermissions(user, PermissionType.DeleteCrops)
}
