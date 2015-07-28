package controllers

import model.UsageRightsProperty
import play.api.libs.json._
import play.api.mvc.Controller

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
import com.gu.mediaservice.model._

import lib.Config

object EditsApi extends Controller with ArgoHelpers {

  import Config.{rootUri, loginUri, kahunaUri, keyStoreBucket, awsCredentials}

  val keyStore = new KeyStore(keyStoreBucket, awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUri, kahunaUri)

    // TODO: add links to the different responses esp. to the reference image
  val indexResponse = {
    val indexData = Map("description" -> "This is the Metadata Editor Service")
    val indexLinks = List(
      Link("edits",             s"$rootUri/metadata/{id}"),
      Link("archived",          s"$rootUri/metadata/{id}/archived"),
      Link("labels",            s"$rootUri/metadata/{id}/labels"),
      Link("usageRights",       s"$rootUri/metadata/{id}/usage-rights"),
      Link("metadata",          s"$rootUri/metadata/{id}/metadata"),
      Link("usage-rights-list", s"$rootUri/usage-rights/categories")
    )
    respond(indexData, indexLinks)
  }

  def index = Authenticated { indexResponse }

  val usageRightsResponse = {
    // FIXME: GuardianWitness should be there but isn't for simplicity;
    // their images can be imported by drag and drop instead
    // FIXME: Creating new instances? Rubbish ಠ_ಠ. I can't think of a way
    // to access the `val`s of the classes though without instantiating them.
    val usageRightsData =
      List(PrImage(), Handout(), Screengrab(), SocialMedia(), Obituary(), Pool(),
           StaffPhotographer("?", "?"), ContractPhotographer("?", "?"), CommissionedPhotographer("?", "?"),
           Agency("?")).sortWith(_.name.toLowerCase < _.name.toLowerCase)
        .map(CategoryResponse.fromUsageRights)

    respond(usageRightsData)
  }

  def getUsageRights = Authenticated { usageRightsResponse }
}

case class CategoryResponse(
  value: String,
  name: String,
  cost: String,
  description: String,
  properties: List[UsageRightsProperty] = List()
)
object CategoryResponse {
  // I'd like to have an override of the `apply`, but who knows how you do that
  // with the JSON parsing stuff
  def fromUsageRights(u: UsageRights): CategoryResponse =
    CategoryResponse(
      value        = u.category,
      name         = u.name,
      cost         = u.defaultCost.getOrElse(Pay).toString,
      description  = u.description,
      properties   = UsageRightsProperty.getPropertiesForCat(u)
    )

  implicit val categoryResponseWrites: Writes[CategoryResponse] = Json.writes[CategoryResponse]

}
