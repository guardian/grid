package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.model._
import lib.EditsConfig
import model.UsageRightsProperty
import play.api.libs.json._
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.ExecutionContext

class EditsApi(auth: Authentication, config: EditsConfig,
               override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {


    // TODO: add links to the different responses esp. to the reference image
  val indexResponse = {
    val indexData = Map("description" -> "This is the Metadata Editor Service")
    val indexLinks = List(
      Link("edits",             s"${config.rootUri}/metadata/{id}"),
      Link("archived",          s"${config.rootUri}/metadata/{id}/archived"),
      Link("labels",            s"${config.rootUri}/metadata/{id}/labels"),
      Link("usageRights",       s"${config.rootUri}/metadata/{id}/usage-rights"),
      Link("metadata",          s"${config.rootUri}/metadata/{id}/metadata"),
      Link("usage-rights-list", s"${config.rootUri}/usage-rights/categories")
    )
    respond(indexData, indexLinks)
  }

  def index = auth { indexResponse }

  val usageRightsResponse = {
    val usageRightsData = UsageRights.all.map(CategoryResponse.fromUsageRights)

    respond(usageRightsData)
  }

  def getUsageRights = auth { usageRightsResponse }
}

case class CategoryResponse(
  value: String,
  name: String,
  cost: String,
  description: String,
  defaultRestrictions: Option[String],
  caution: Option[String],
  properties: List[UsageRightsProperty] = List()
)
object CategoryResponse {
  // I'd like to have an override of the `apply`, but who knows how you do that
  // with the JSON parsing stuff
  def fromUsageRights(u: UsageRightsSpec): CategoryResponse =
    CategoryResponse(
      value               = u.category,
      name                = u.name,
      cost                = u.defaultCost.getOrElse(Pay).toString,
      description         = u.description,
      defaultRestrictions = u.defaultRestrictions,
      caution             = u.caution,
      properties          = UsageRightsProperty.getPropertiesForSpec(u)
    )

  implicit val categoryResponseWrites: Writes[CategoryResponse] = Json.writes[CategoryResponse]

}
