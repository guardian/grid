package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation, BaseControllerWithLoginRedirects}
import lib.{ExampleSwitch, FeatureSwitches, KahunaClientServiceUrls, KahunaConfig}
import play.api.mvc.ControllerComponents
import play.api.libs.json._

import scala.concurrent.ExecutionContext
import com.gu.mediaservice.lib.config.FieldAlias._
import com.gu.mediaservice.lib.config.{InstanceForRequest, Services}
import com.gu.mediaservice.model.Instance
import play.api.mvc.Security.AuthenticatedRequest
import play.twirl.api.Html

class KahunaController(
  authentication: Authentication,
  val config: KahunaConfig,
  override val controllerComponents: ControllerComponents,
  authorisation: Authorisation
)(
  implicit val ec: ExecutionContext
) extends BaseControllerWithLoginRedirects with ArgoHelpers with InstanceForRequest {

  override def auth: Authentication = authentication

  override def services: Services = config.services

  def index(ignored: String) = withOptionalLoginRedirect { request =>
    implicit val instance: Instance = instanceOf(request)

    val maybeUser: Option[Authentication.Principal] = request match {
      case authedRequest: AuthenticatedRequest[_, _] => authedRequest.user match {
        case principal: Principal => Some(principal)
        case _ => None
      }
      case _ => None
    }

    val isIFramed = request.headers.get("Sec-Fetch-Dest").contains("iframe")
    val featureSwitches = new FeatureSwitches(
      List(ExampleSwitch)
    )
    val featureSwitchesWithClientValues = featureSwitches.getClientSwitchValues(featureSwitches.getFeatureSwitchCookies(request.cookies.get))
    val featureSwitchesJson = Json.stringify(Json.toJson(featureSwitches.getFeatureSwitchesToStringify(featureSwitchesWithClientValues)))

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
    val announcements: String = Json.toJson(config.announcements).toString()
    val interimFilterOptions: String = Json.toJson(config.interimFilterOptions).toString()
    val returnUri = config.rootUri(instance) + okPath
    val costFilterLabel = config.costFilterLabel.getOrElse("Free to use only")
    val costFilterChargeable = config.costFilterChargeable.getOrElse(false)
    val maybeOrgOwnedValue =
      if(config.shouldDisplayOrgOwnedCountAndFilterCheckbox)
        Html(""""Owned"""")
      else
        Html("undefined")
    val imageTypes = Json.toJson(config.imageTypes).toString()

    val rootUri = config.rootUri(instance)

    val kahunaClientServiceUrls = KahunaClientServiceUrls(
      rootUri = rootUri,
      mediaApiUri = config.mediaApiUri(instance),
      authUri = config.authUri(instance)
    )

    Ok(views.html.main(
      s"${config.authUri(instance)}/login?redirectUri=$returnUri",
      fieldAliases,
      scriptsToLoad,
      domainMetadataSpecs,
      metadataTemplates,
      announcements,
      interimFilterOptions,
      additionalNavigationLinks,
      costFilterLabel,
      costFilterChargeable,
      maybeOrgOwnedValue,
      config,
      featureSwitchesJson,
      imageTypes,
      kahunaClientServiceUrls
    ))
  }

  def quotas = authentication { req =>
    Ok(views.html.quotas(config.mediaApiUri(instanceOf(req))))
  }

  def notifications = authentication { req =>
    val announcements: String = Json.toJson(config.announcements).toString()
    Ok(announcements)
  }

  def ok = Action { implicit request =>
    Ok("ok")
  }
}
