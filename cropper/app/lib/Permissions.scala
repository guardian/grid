package lib

import scala.concurrent.{ExecutionContext, Future}
import com.gu.mediaservice.lib.auth._


object PermissionDeniedError extends Throwable("Permission denied")

object Permissions {
  val permissionStore = new PermissionStore(Config.configBucket, Config.awsCredentials)

  def validateUserWithPermissions(user: Principal, permission: PermissionType.PermissionType)
                                 (implicit ec: ExecutionContext): Future[Principal] = {

    val failFuture = Future.failed(PermissionDeniedError)

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
}
