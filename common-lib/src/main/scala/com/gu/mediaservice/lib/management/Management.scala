package com.gu.mediaservice.lib.management

import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.auth.PermissionsHandler
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}

trait BuildInfo {
  def toJson: String
}

trait ManagementController extends BaseController with ArgoHelpers {
  def buildInfo: BuildInfo

  def healthCheck = Action {
    Ok("OK")
  }

  def disallowRobots = Action {
    Ok("User-agent: *\nDisallow: /\n")
  }

  def manifest = Action {
    Ok(Json.parse(buildInfo.toJson))
  }
}

class Management(override val controllerComponents: ControllerComponents, override val buildInfo: BuildInfo) extends ManagementController

class ManagementWithPermissions(override val controllerComponents: ControllerComponents, permissionedController: PermissionsHandler, override val buildInfo: BuildInfo) extends ManagementController {
  override def healthCheck = Action {
    if(permissionedController.storeIsEmpty) {
      ServiceUnavailable("Permissions store is empty")
    } else {
      Ok("ok")
    }
  }
}
