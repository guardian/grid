package controllers

import java.util.UUID

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.config.Services
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.ExecutionContext

class KahunaController(auth: Authentication, services: Services, sentryDsn: Option[String], googleTrackingId: Option[String],
                       override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)

  extends BaseController with ArgoHelpers {

  def index(ignored: String) = Action { req =>
    val okPath = routes.KahunaController.ok.url
    // If the auth is successful, we redirect to the kahuna domain so the iframe
    // is on the same domain and can be read by the JS
    val returnUri = services.kahunaBaseUri + okPath
    Ok(views.html.main(
      services.apiBaseUri,
      services.authBaseUri,
      s"${services.authBaseUri}/login?redirectUri=$returnUri",
      sentryDsn,
      sessionId = UUID.randomUUID().toString,
      googleTrackingId
    ))
  }

  def quotas = auth { req =>
    Ok(views.html.quotas(services.apiBaseUri))
  }

  def ok = Action { implicit request =>
    Ok("ok")
  }
}
