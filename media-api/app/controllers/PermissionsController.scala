package controllers

import scala.concurrent.Future

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._

import play.api.libs.json._

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._

import com.gu.mediaservice.lib.auth.PermissionType

import lib.Config


object PermissionsController extends Controller with ArgoHelpers {

  val Authenticated = Authed.action
  val permissionStore = Authed.permissionStore

  def permissionsResponse(permissions: Set[PermissionType.PermissionType]) = {
    val perms = Json.toJson(permissions.map(_.toString))

    val permsData = Json.obj(
      "description" -> "Available permissions for current user (you)",
      "permissions" -> perms
    )

    respond(permsData)
  }

  def getUserPermissions = Authenticated.async { request =>
    request.user match {
      case user: PandaUser =>
        permissionStore
          .getUserPermissions(user)
          .map(permissionsResponse)

      case _: AuthenticatedService => Future(NotFound)
      case _ => Future(BadRequest)
    }


  }
}
