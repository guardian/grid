package com.gu.mediaservice.lib.auth

import com.gu.editorial.permissions.client._
import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.ExecutionContext.Implicits.global

import org.slf4j.LoggerFactory


object PermissionDeniedError extends Throwable("Permission denied")

object PermissionsHandler {
  val failFuture = Future.failed(PermissionDeniedError)
  private lazy val log = LoggerFactory.getLogger(getClass)

  def validateUserWithPermissions(user: Principal, permission: Permission)
                                 (implicit ec: ExecutionContext): Future[Principal] =
    hasPermission(user, permission) flatMap {
      case true  => Future.successful(user)
      case false => failFuture
    }

  def hasPermission(user: Principal, permission: Permission) : Future[Boolean] = {
    user match {
      case u: PandaUser => {
        Permissions.get(permission)(PermissionsUser(u.email)).map {
          case PermissionGranted => true
          case PermissionDenied => false

        // fail open
        } recover { case  e => {
          log.error("Failed to get permissions!", e)

          true
        }}
      }
      // think about only allowing certain services i.e. on `service.name`?
      case service: AuthenticatedService => Future.successful(true)
      case _ => Future.successful(false)
    }
  }
}
