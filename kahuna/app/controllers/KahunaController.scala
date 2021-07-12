package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation}
import lib.KahunaConfig
import play.api.mvc.{BaseController, ControllerComponents}
import play.api.libs.json._
import scala.concurrent.ExecutionContext
import com.gu.mediaservice.lib.config.FieldAlias._

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

    val isIFramed = req.headers.get("Sec-Fetch-Dest").contains("iframe")

    val scriptsToLoad = config.scriptsToLoad
      .filter(_.shouldLoadWhenIFramed.contains(true) || !isIFramed)
      .filter(_.permission.map(authorisation.hasPermissionTo).fold(true)(maybeUser.exists))

    val okPath = routes.KahunaController.ok.url
    // If the auth is successful, we redirect to the kahuna domain so the iframe
    // is on the same domain and can be read by the JS
    val fieldAliases: String = Json.toJson(config.fieldAliasConfigs).toString()
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
      fieldAliases,
      scriptsToLoad,
      config.staffPhotographerOrganisation,
      config.homeLinkHtml,
      config.systemName,
      config.canDownloadCrop
    ))
  }

  def quotas = authentication { req =>
    Ok(views.html.quotas(config.mediaApiUri))
  }

  def ok = Action { implicit request =>
    Ok("ok")
  }
}
