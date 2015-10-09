package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
import com.gu.mediaservice.lib.aws.NoItemFound
import lib.Config
import model._
import play.api.mvc.Controller

import scala.concurrent.ExecutionContext.Implicits.global


object UsageApi extends Controller with ArgoHelpers {

  import Config.{awsCredentials, kahunaUri, keyStoreBucket, loginUriTemplate, rootUri}

  val keyStore = new KeyStore(keyStoreBucket, awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUriTemplate, kahunaUri)

  val indexResponse = {
    val indexData = Map("description" -> "This is the Usage Recording service")
    val indexLinks = List(
      Link("usage", s"$rootUri/usage/media/{id}")
    )
    respond(indexData, indexLinks)
  }
  def index = Authenticated { indexResponse }

  def forMedia(mediaId: String) = Authenticated.async {
    val usagesFuture = UsageTable.queryByImageId(mediaId)

    usagesFuture.map( usages => {
      respondCollection(usages.map(UsageResponse.build).toList)
    }).recover {
      case NoItemFound => respond(false)
    }
  }
}
