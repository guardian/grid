package com.gu.mediaservice.lib.auth

import com.gu.editorial.permissions.client._
import com.gu.mediaservice.lib.auth.Authentication.{AuthenticatedService, PandaUser, Principal}
import org.slf4j.LoggerFactory

import scala.concurrent.{ExecutionContext, Future}


object PermissionDeniedError extends Throwable("Permission denied")

object PermissionsHandler {
  private lazy val log = LoggerFactory.getLogger(getClass)

  def hasPermission(user: Principal, permission: Permission)(implicit ec: ExecutionContext): Future[Boolean] = {
    user match {
      case PandaUser(u) => {
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
      case AuthenticatedService(_) => Future.successful(true)
      case _ => Future.successful(false)
    }
  }
}
