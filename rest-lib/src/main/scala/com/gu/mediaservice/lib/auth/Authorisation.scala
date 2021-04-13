package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, Principal, Request}
import com.gu.mediaservice.lib.auth.Permissions.{PrincipalFilter, UploadImages}
import com.gu.mediaservice.lib.auth.provider.AuthorisationProvider
import play.api.mvc.{ActionFilter, Result, Results}

import scala.concurrent.{ExecutionContext, Future}

class Authorisation(provider: AuthorisationProvider, executionContext: ExecutionContext) extends Results with ArgoHelpers {
  def actionFilterFor(permission: SimplePermission, unauthorisedResult: Result): ActionFilter[Request] = new ActionFilter[Request] {
    override protected def filter[A](request: Request[A]): Future[Option[Result]] = {
      if (hasPermissionTo(permission)(request.user)) {
        Future.successful(None)
      } else {
        Future.successful(Some(unauthorisedResult))
      }
    }
    override protected def executionContext: ExecutionContext = Authorisation.this.executionContext
  }
  def actionFilterFor(permission: SimplePermission): ActionFilter[Request] =
    actionFilterFor(
      permission,
      respondError(Unauthorized, "permission-denied", s"You do not have permission to ${permission.name}")
    )

  object CommonActionFilters {
    lazy val authorisedForUpload = actionFilterFor(UploadImages)
  }

  def hasPermissionTo(permission: SimplePermission): PrincipalFilter = {
    principal: Principal => {
      principal match {
        // a machine principal with internal tier can always see anything
        case MachinePrincipal(ApiAccessor(_, Internal), _) => true
        case _ => provider.hasPermissionTo(permission, principal)
      }
    }
  }
}
