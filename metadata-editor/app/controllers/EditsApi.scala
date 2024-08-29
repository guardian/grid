package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation}
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.Permissions.EditMetadata
import com.gu.mediaservice.lib.config.{RuntimeUsageRightsConfig, UsageRightsConfigProvider}
import com.gu.mediaservice.model._
import lib.EditsConfig
import model.UsageRightsProperty
import model.UsageRightsLease
import play.api.libs.json._
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc.{AnyContent, BaseController, ControllerComponents, Request}

import scala.concurrent.ExecutionContext

class EditsApi(auth: Authentication,
               config: EditsConfig,
               authorisation: Authorisation,
               override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {


    // TODO: add links to the different responses esp. to the reference image
  def indexResponse()(implicit request: Request[AnyContent]) = {
    val indexData = Map("description" -> "This is the Metadata Editor Service")
    val indexLinks = List(
      Link("edits",             s"${config.rootUri}/metadata/{id}"),
      Link("archived",          s"${config.rootUri}/metadata/{id}/archived"),
      Link("labels",            s"${config.rootUri}/metadata/{id}/labels"),
      Link("usageRights",       s"${config.rootUri}/metadata/{id}/usage-rights"),
      Link("metadata",          s"${config.rootUri}/metadata/{id}/metadata"),
      Link("usage-rights-list", s"${config.rootUri}/usage-rights/categories"),
      Link("filtered-usage-rights-list", s"${config.rootUri}/usage-rights/filtered-categories")
    )
    respond(indexData, indexLinks)
  }

  def index = auth { request =>
    indexResponse()(request)
  }

  def usageRightsResponse()(implicit request: Request[AnyContent]) = {
    val usageRights = config.applicableUsageRights.toList

    val usageRightsData = usageRights
      .map(u => CategoryResponse.fromUsageRights(u, config))

    respond(usageRightsData)
  }

  def getUsageRights = auth { request =>
    usageRightsResponse()(request)
  }

  def filteredUsageRightsResponse(request: AuthenticatedRequest[AnyContent, Principal]) = {
    val usageRights = config.applicableUsageRights.toList
    val stdUsrExcluded = config.stdUserExcludedUsageRights.toList
    val writePermission = authorisation.isUploaderOrHasPermission(request.user, "", EditMetadata)

    val usageRightsData = usageRights
          .filter(u => writePermission || !stdUsrExcluded.contains(u.category))
          .map(u => CategoryResponse.fromUsageRights(u, config))

    respond(usageRightsData)
  }

  def getFilteredUsageRights() = auth { request =>
    filteredUsageRightsResponse(request)
  }
}

case class CategoryResponse(
  value: String,
  name: String,
  cost: String,
  description: String,
  defaultRestrictions: Option[String],
  caution: Option[String],
  properties: List[UsageRightsProperty] = List(),
  leases: Seq[UsageRightsLease] = Seq(),
  usageRestrictions: Option[String],
  usageSpecialInstructions: Option[String]
)
object CategoryResponse {
  // I'd like to have an override of the `apply`, but who knows how you do that
  // with the JSON parsing stuff

  def fromUsageRights(u: UsageRightsSpec, config: EditsConfig) = CategoryResponse (
      value = u.category,
      name = u.name(config),
      cost = u.defaultCost.getOrElse(Pay).toString,
      description = u.description(config),
      defaultRestrictions = u.defaultRestrictions,
      caution = u.caution,
      properties = UsageRightsProperty.getPropertiesForSpec(u, config.usageRightsConfig),
      leases = UsageRightsLease.getLeasesForSpec(u, config.usageRightsLeases),
      usageRestrictions = config.customUsageRestrictions.get(u.category),
      usageSpecialInstructions = config.customSpecialInstructions.get(u.category)
  )

  implicit val categoryResponseWrites: Writes[CategoryResponse] = Json.writes[CategoryResponse]

}
