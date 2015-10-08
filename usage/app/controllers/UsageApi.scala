package controllers

import play.api.libs.json._
import play.api.mvc.Controller

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.aws.NoItemFound
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
import com.gu.mediaservice.model._

import scala.concurrent.ExecutionContext.Implicits.global

import lib.Config
import model._

import scala.util.Random


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

  def forContent(contentId: String) = Authenticated {
    respondCollection(Examples.getMedia)
  }

  def forMedia(mediaId: String) = Authenticated.async {
    val usagesFuture = UsageRecordTable.queryByImageId(mediaId)

    usagesFuture.map( usages => {
      respondCollection(usages.toList)
    }).recover {
      case NoItemFound => respond(false)
    }
  }
}


trait Platform { val id: String }
case object Print extends Platform { val id = "print" }
case object Web extends Platform { val id = "web" }
object Platform {
  implicit val jsonWrites: Writes[Platform] = Writes[Platform](c => JsString(c.id))
}

case class Content(contentId: String, platform: Platform)
object Content { implicit val jsonWrites: Writes[Content] = Json.writes[Content] }

case class Media(mediaId: String)
object Media { implicit val jsonWrites: Writes[Media] = Json.writes[Media] }

object Examples {
  def getMedia = List.fill(Random.nextInt(10))(Media(Random.alphanumeric.take(32).mkString))
  def getContent = List.fill(Random.nextInt(10))(Content(Random.alphanumeric.take(32).mkString, Random.nextInt(2) match {
    case 0 => Print
    case _ => Web
  }))
}

