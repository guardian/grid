package com.gu.mediaservice.lib.auth

import scala.concurrent.{ExecutionContext, Future}


object PermissionDeniedError extends Throwable("Permission denied")

trait PermissionsHandler {
  val failFuture = Future.failed(PermissionDeniedError)
  val permissionStore: PermissionStore

  def validateUserWithPermissions(user: Principal, permission: PermissionType.PermissionType)
                                 (implicit ec: ExecutionContext): Future[Principal] =
    getPermissionValForUser(permission, user) flatMap {
      case true  => Future.successful(user)
      case false => failFuture
    }

  def getPermissionValForUser(permission: PermissionType.PermissionType, user: Principal): Future[Boolean] = {
    println(user)
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
