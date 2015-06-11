package controllers

import com.gu.mediaservice.lib.config.UsageRightsConfig
import play.api.libs.json.{Json, Writes}
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
    val usageRightsData =
      List(PrImage, Handout, Screengrab, GuardianWitness, SocialMedia, Obituary)
        .map(CategoryResponse.fromCat)

    respond(usageRightsData)
  }

  def getUsageRights = Authenticated { usageRightsResponse }
}

case class CategoryResponse(value: String, name: String, cost: String, restrictions: Option[String] = None)
object CategoryResponse {
  // I'd like to have an override of the `apply`, but who nows how you do that
  // with the JSON parsing stuff
  def fromCat(cat: UsageRightsCategory): CategoryResponse =
    CategoryResponse(
      value = cat.toString,
      name  = cat.name,
      cost  = UsageRightsConfig.categoryCosts.getOrElse(cat, Pay).toString,
      restrictions = cat.restrictions
    )

  implicit val categoryResponseWrites: Writes[CategoryResponse] = Json.writes[CategoryResponse]

}
