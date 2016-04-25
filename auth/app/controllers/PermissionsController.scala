package controllers

import scala.concurrent.Future

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._

import play.api.libs.json._

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._

import com.gu.mediaservice.lib.auth.{PermissionSet, PermissionType}

import lib.Config


object PermissionsController extends Controller with ArgoHelpers {

  import Config.rootUri

  val Authenticated = Authed.action
  val permissionStore = Authed.permissionStore

  val indexResponse = {
    val indexData = Map("description" -> "This is the Auth Permissions API")
    val indexLinks = List(
      Link("root", s"$rootUri"),
      Link("permissions", s"$rootUri/permissions/user/{id}"),
      Link("groups", s"$rootUri/permissions/groups"),
      Link("me", s"$rootUri/permissions/me")
    )
    respond(indexData, indexLinks)
  }

  def index = Authenticated { indexResponse }

  def permissionsResponse(permissionSet: PermissionSet, user: PandaUser) = {
    val permsData = Json.obj(
      "description" -> s"Permissions for ${user.name}",
      "permissionsSet" -> Json.toJson(permissionSet)
    )

    respond(permsData)
  }

  def getGroups = Authenticated.async {
    permissionStore.getGroups.map(groups => respond(groups))
  }

  def getUserPermissions(id: String)  = Authenticated { NotImplemented }

  def getMyPermissions = Authenticated.async { request =>
    request.user match {
      case user: PandaUser =>
        permissionStore
          .getUserPermissions(user)
          .map(perms => permissionsResponse(perms, user))

      case _: AuthenticatedService => Future(NotFound)
      case _ => Future(BadRequest)
    }


  }
}
