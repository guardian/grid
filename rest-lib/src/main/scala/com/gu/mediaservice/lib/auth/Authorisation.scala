package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, Principal, Request}
import com.gu.mediaservice.lib.auth.Permissions.{PrincipalFilter, VisibilityFilter}
import com.gu.mediaservice.lib.auth.provider.AuthorisationProvider
import play.api.libs.json.Json
import play.api.mvc.{ActionFilter, Result, Results}

import scala.concurrent.{ExecutionContext, Future}

class Authorisation(provider: AuthorisationProvider, executionContext: ExecutionContext) extends Results {
  def actionFilterFor(permission: PermissionContext[_], unauthorisedResult: Result): ActionFilter[Request] = new ActionFilter[Request] {
    override protected def filter[A](request: Request[A]): Future[Option[Result]] = {
      if (hasPermissionTo(permission)(request.user)) {
        Future.successful(None)
      } else {
        Future.successful(Some(unauthorisedResult))
      }
    }
    override protected def executionContext: ExecutionContext = Authorisation.this.executionContext
  }
  def actionFilterFor(permission: PermissionContext[_]): ActionFilter[Request] =
    actionFilterFor(
      permission,
      Unauthorized(Json.obj("error" -> "unauthorized"))
    )

  def hasPermissionTo[T](permission: SimplePermission): PrincipalFilter =
    hasPermissionTo(PermissionContext(permission))

  def hasPermissionTo[T](permission: PermissionWithParameter[T], parameter: T): PrincipalFilter =
    hasPermissionTo(permission -> parameter)

  def hasPermissionTo[T](permission: PermissionContext[T]): PrincipalFilter = {
    val filter = provider.hasPermissionTo(permission)
    principal: Principal => {
      principal match {
        // a machine principal with internal tier can always see anything
        case MachinePrincipal(ApiAccessor(_, Internal), _) => true
        case _ => filter(principal)
      }
    }
  }

  def visibilityFilterFor[T](permission: PermissionWithParameter[T], principal: Principal): VisibilityFilter[T] =
    principal match {
      // a machine principal with internal tier can always see anything
      case MachinePrincipal(ApiAccessor(_, Internal), _) => _ => true
      case _ => provider.visibilityFilterFor(permission, principal)
    }
}
