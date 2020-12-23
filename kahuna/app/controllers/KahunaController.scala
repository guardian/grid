package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.{Authentication, PermissionsHandler}
import lib.KahunaConfig
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.ExecutionContext

class KahunaController(auth: Authentication, val config: KahunaConfig, override val controllerComponents: ControllerComponents)
                      (implicit val ec: ExecutionContext) extends BaseController with ArgoHelpers with PermissionsHandler {

  def index(ignored: String) = Action { req =>

    val maybeUser = auth.authenticationStatus(req).toOption

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
      config.scriptsToLoad.filter(_.permission.exists(permission => maybeUser.exists(hasPermission(_, permission))))
    ))
  }

  def quotas = auth { req =>
    Ok(views.html.quotas(config.mediaApiUri))
  }

  def ok = Action { implicit request =>
    Ok("ok")
  }
}
