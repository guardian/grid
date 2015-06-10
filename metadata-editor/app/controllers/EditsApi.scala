package controllers

import com.gu.mediaservice.lib.config.UsageRightsConfig
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
      Link("edits",           s"$rootUri/metadata/{id}"),
      Link("archived",        s"$rootUri/metadata/{id}/archived"),
      Link("labels",          s"$rootUri/metadata/{id}/labels"),
      Link("usageRights",     s"$rootUri/metadata/{id}/usage-rights"),
      Link("metadata",        s"$rootUri/metadata/{id}/metadata"),
      Link("usageRightsList", s"$rootUri/metadata/usage-rights")
    )
    respond(indexData, indexLinks)
  }

  def index = Authenticated { indexResponse }


  val usageRightsResponse = {
    val usageRightsData =
      List(PrImage, Handout, Screengrab, GuardianWitness, SocialMedia, Obituary)
        .map(categoryMap)

    respond(usageRightsData)
  }

  def getUsageRights = Authenticated { usageRightsResponse }

  // Not sure about this, but I don't want to add it to the case classes.
  private def makeCategoryName(s: String) =
    s.replace("-", " ").split(" ").map(_.capitalize).mkString(" ")

  private def categoryMap(cat: UsageRightsCategory) = Map(
    "value" -> cat.toString,
    "name"  -> makeCategoryName(cat.toString),
    "cost"  -> UsageRightsConfig.categoryCosts.getOrElse(cat, Pay).toString
  )
}
