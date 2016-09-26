package com.gu.mediaservice.lib.auth

import com.gu.editorial.permissions.client._
import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.ExecutionContext.Implicits.global


object PermissionDeniedError extends Throwable("Permission denied")

trait PermissionsHandler {
  val failFuture = Future.failed(PermissionDeniedError)
  val permissionStore: PermissionStore

  def validateUserWithPermissions(user: Principal, permission: Permission)
                                 (implicit ec: ExecutionContext): Future[Principal] =
    getPermissionValForUser(permission, user) flatMap {
      case true  => Future.successful(user)
      case false => failFuture
    }

  def getPermissionValForUser(permission: Permission, user: Principal): Future[Boolean] = {
    user match {
      case u: PandaUser => {
        GridServicePermissions.get(permission)(PermissionsUser(user.name)).map {
          case PermissionGranted => true
          case _ => false
        } recover { case  _ => false }
      }
      // think about only allowing certain services i.e. on `service.name`?
      case service: AuthenticatedService => Future.successful(true)
      case _ => Future.successful(false)
    }
  }
}
