package controllers

import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.ExecutionContext

class HealthCheck(override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController {

  def healthCheck = Action {
    Ok("OK")
  }
}
