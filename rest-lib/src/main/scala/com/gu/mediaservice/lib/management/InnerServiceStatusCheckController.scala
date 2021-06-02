package com.gu.mediaservice.lib.management

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.InnerServicePrincipal
import com.gu.mediaservice.lib.config.Services
import play.api.libs.json.{JsValue, Json, Writes}
import play.api.libs.ws.{WSClient, WSRequest}
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.{ExecutionContext, Future}

case class WhoAmIResponse (baseUri: String, status: Int, body: JsValue)
object WhoAmIResponse { implicit val writes: Writes[WhoAmIResponse] = Json.writes[WhoAmIResponse] }

class InnerServiceStatusCheckController(
  auth: Authentication,
  override val controllerComponents: ControllerComponents,
  services: Services,
  ws: WSClient
)(implicit ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  private def callAllInternalServices(authenticator: WSRequest => WSRequest) = {
    val whoAmIFutures = services.allInternalUris.map { baseUri =>
      authenticator(ws.url(s"$baseUri/management/whoAmI")).get.map(resp => WhoAmIResponse(baseUri, resp.status, resp.body[JsValue]))
    }

    Future.sequence(whoAmIFutures).map { whoAmIResponses =>
      val overallStatus = whoAmIResponses.map(_.status).max
      new Status(overallStatus)(Json.toJson(whoAmIResponses.map(resp => resp.baseUri -> resp).toMap))
    }
  }

  def whoAmI = auth.async { request =>
    request.user match {
      case principal: InnerServicePrincipal if !principal.identity.contains(" via ") =>
        callAllInternalServices(auth.getOnBehalfOfPrincipal(principal))
      case _ =>
        Future.successful(
          Ok(Json.toJson(request.user.toString))
        )
    }
  }

  def statusCheck = Action.async {
    callAllInternalServices(auth.innerServiceCall)
  }
}
