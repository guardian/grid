package controllers

import play.api.libs.json._
import play.api.mvc.Controller

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
import com.gu.mediaservice.model._

import lib.Config


object UsageApi extends Controller with ArgoHelpers {

  import Config.{rootUri, loginUriTemplate, kahunaUri, keyStoreBucket, awsCredentials}

  val keyStore = new KeyStore(keyStoreBucket, awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUriTemplate, kahunaUri)

  val indexResponse = {
    val indexData = Map("description" -> "This is the Usage Recording service")
    val indexLinks = List(
      Link("usage", s"$rootUri/usage/{id}")
    )
    respond(indexData, indexLinks)
  }
  def index = Authenticated { indexResponse }

}
