package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation}
import lib.KahunaConfig
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.ExecutionContext

class KahunaController(
  authentication: Authentication,
  val config: KahunaConfig,
  override val controllerComponents: ControllerComponents,
  authorisation: Authorisation
)(
  implicit val ec: ExecutionContext
) extends BaseController with ArgoHelpers {

  def index(ignored: String) = Action { req =>

    val maybeUser: Option[Authentication.Principal] = authentication.authenticationStatus(req).toOption

    val okPath = routes.KahunaController.ok.url
    // If the auth is successful, we redirect to the kahuna domain so the iframe
    // is on the same domain and can be read by the JS
    val returnUri = config.rootUri + okPath
    Ok(views.html.main(
      config.mediaApiUri,
      config.authUri,
      s"${config.authUri}/login?redirectUri=$returnUri",
      config.sentryDsn,
      config.sessionId,
      config.googleTrackingId,
      config.feedbackFormLink,
      config.usageRightsHelpLink,
      config.invalidSessionHelpLink,
      config.supportEmail,
      config.scriptsToLoad.filter(_.permission.map(authorisation.hasPermissionTo).fold(true)(maybeUser.exists))
    ))
  }

  def quotas = authentication { req =>
    Ok(views.html.quotas(config.mediaApiUri))
  }

  def ok = Action { implicit request =>
    Ok("ok")
  }
}
