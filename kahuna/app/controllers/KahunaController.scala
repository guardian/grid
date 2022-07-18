package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation, BaseControllerWithLoginRedirects}
import lib.KahunaConfig
import play.api.mvc.ControllerComponents
import play.api.libs.json._

import scala.concurrent.ExecutionContext
import com.gu.mediaservice.lib.config.FieldAlias._
import com.gu.mediaservice.lib.config.Services
import play.api.mvc.Security.AuthenticatedRequest

class KahunaController(
  authentication: Authentication,
  val config: KahunaConfig,
  override val controllerComponents: ControllerComponents,
  authorisation: Authorisation
)(
  implicit val ec: ExecutionContext
) extends BaseControllerWithLoginRedirects with ArgoHelpers {

  override def auth: Authentication = authentication

  override def services: Services = config.services

  def index(ignored: String) = withOptionalLoginRedirect { request =>

    val maybeUser: Option[Authentication.Principal] = request match {
      case authedRequest: AuthenticatedRequest[_, _] => authedRequest.user match {
        case principal: Principal => Some(principal)
        case _ => None
      }
      case _ => None
    }

    val isIFramed = request.headers.get("Sec-Fetch-Dest").contains("iframe")

    val scriptsToLoad = config.scriptsToLoad
      .filter(_.shouldLoadWhenIFramed.contains(true) || !isIFramed)
      .filter(_.permission.map(authorisation.hasPermissionTo).fold(true)(maybeUser.exists))
    val okPath = routes.KahunaController.ok.url
    // If the auth is successful, we redirect to the kahuna domain so the iframe
    // is on the same domain and can be read by the JS
    val additionalNavigationLinks: String = Json.toJson(config.additionalLinks).toString()
    val domainMetadataSpecs: String = Json.toJson(config.domainMetadataSpecs).toString()
    val fieldAliases: String = Json.toJson(config.fieldAliasConfigs).toString()
    val metadataTemplates: String = Json.toJson(config.metadataTemplates).toString()
    val returnUri = config.rootUri + okPath
    val costFilterLabel = config.costFilterLabel.getOrElse("Free to use only")
    val costFilterChargeable = config.costFilterChargeable.getOrElse(false)
    val restrictDownload = config.restrictDownload.getOrElse(false)
    Ok(views.html.main(
      s"${config.authUri}/login?redirectUri=$returnUri",
      fieldAliases,
      scriptsToLoad,
      domainMetadataSpecs,
      metadataTemplates,
      additionalNavigationLinks,
      costFilterLabel,
      costFilterChargeable,
      restrictDownload,
      config
    ))
  }

  def quotas = authentication { req =>
    Ok(views.html.quotas(config.mediaApiUri))
  }

  def ok = Action { implicit request =>
    Ok("ok")
  }
}
