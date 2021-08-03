package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication.{InnerServicePrincipal, MachinePrincipal, Principal, Request, UserPrincipal}
import com.gu.mediaservice.lib.auth.Permissions.{ArchiveImages, DeleteCropsOrUsages, PrincipalFilter, UploadImages}
import com.gu.mediaservice.lib.auth.provider.AuthorisationProvider
import play.api.mvc.{ActionFilter, Result, Results}

import scala.concurrent.{ExecutionContext, Future}

class Authorisation(provider: AuthorisationProvider, executionContext: ExecutionContext) extends Results with ArgoHelpers {
  def forbidden(permission: SimplePermission): Result = respondError(Forbidden, "permission-denied", s"You do not have permission to ${permission.name}")


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
      forbidden(permission)
    )

  def actionFilterForUploaderOr(
                                          imageId: String,
                                          permission: SimplePermission,
                                          getUploader: (String, Principal) => Future[Option[String]]
                                        )(implicit ec: ExecutionContext): ActionFilter[Request] = new ActionFilter[Request] {
//    implicit val ec = executionContext
    override protected def filter[A](request: Request[A]): Future[Option[Result]] = {
      //We first check for permissions, if the user has permissions we avoid evaluating the getUploader function
      val hasPermission: Boolean = hasPermissionTo(permission)(request.user)
      if (hasPermission) {
        Future.successful(None)
      } else {
        val result = for {
          uploadedBy <- getUploader(imageId, request.user)
          isAuthorised = isUploaderOrHasPermission(request.user, uploadedBy.getOrElse(""), permission)
          if isAuthorised
        } yield {
          Future.successful(None)
        }
        result.flatten.recover{case _ => Some(forbidden(permission))}
      }
    }
    override protected def executionContext: ExecutionContext = ec
  }

  object CommonActionFilters {
    lazy val authorisedForUpload = actionFilterFor(UploadImages)
    lazy val authorisedForArchive = actionFilterFor(ArchiveImages)
    lazy val authorisedForDeleteCropsOrUsages = actionFilterFor(DeleteCropsOrUsages)
  }

  def isUploaderOrHasPermission(
    principal: Principal,
    uploadedBy: String,
    permission: SimplePermission
  ) = {
    principal match {
      case user: UserPrincipal =>
        user.email.equalsIgnoreCase(uploadedBy) || hasPermissionTo(permission)(principal)
      case MachinePrincipal(ApiAccessor(_, Internal), _) => true
      case InnerServicePrincipal(_, _) => true
      case _ => false
    }
  }

  def hasPermissionTo(permission: SimplePermission): PrincipalFilter = {
    principal: Principal => {
      principal match {
        // a machine principal with internal tier can always see anything
        case MachinePrincipal(ApiAccessor(_, Internal), _) => true
        case InnerServicePrincipal(_, _) => true
        case _ => provider.hasPermissionTo(permission, principal)
      }
    }
  }
}
