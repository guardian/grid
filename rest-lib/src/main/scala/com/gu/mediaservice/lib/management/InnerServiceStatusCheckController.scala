package com.gu.mediaservice.lib.management

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.config.Services
import play.api.libs.json.{Json, Writes}
import play.api.libs.ws.WSClient
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.{ExecutionContext, Future}

case class WhoAmIResponse (baseUri: String, status: Int, body: String)
object WhoAmIResponse { implicit val writes: Writes[WhoAmIResponse] = Json.writes[WhoAmIResponse] }

class InnerServiceStatusCheckController(
  override val controllerComponents: ControllerComponents,
  services: Services,
  ws: WSClient
)(implicit ec: ExecutionContext)
  extends BaseController with ArgoHelpers {
  def whoAmI = Action {
    Ok("whoAmI hello!")
  }

  def statusCheck = Action.async {
    val whoAmIFutures = services.allInternalUris.map { baseUri =>
      ws.url(s"$baseUri/management/whoAmI").get.map(resp => WhoAmIResponse(baseUri, resp.status, resp.body.take(50)))
    }

    Future.sequence(whoAmIFutures).map { whoAmIResponses =>
      val overallStatus = if (whoAmIResponses.exists(_.status > 299)) MultiStatus else Ok
      overallStatus(Json.toJson(whoAmIResponses.map(resp => resp.baseUri -> resp).toMap))
    }
  }
}
