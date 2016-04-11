package controllers

import java.net.URI

import scala.concurrent.Future

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._

import play.api.libs.json._

import com.gu.mediaservice.model.MediaLease

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._

import lib.{Config, ControllerHelper}


case class AppIndex(name: String, description: String, config: Map[String, String] = Map())
object AppIndex {
  implicit def jsonWrites: Writes[AppIndex] = Json.writes[AppIndex]
}


import java.util.UUID
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient

import com.gu.scanamo._
import com.gu.mediaservice.model.{MediaLease, MediaLeaseType}

import org.joda.time._
import cats.data.Validated
import scalaz.syntax.id._

import lib.Config

object LeaseStore {
  implicit val dateTimeFormat =
    DynamoFormat.xmap(DynamoFormat.stringFormat)(d => Validated.valid(new DateTime(d)))(_.toString)
  implicit val enumFormat =
    DynamoFormat.xmap(DynamoFormat.stringFormat)(e => Validated.valid(MediaLeaseType(e)))(_.toString)

  lazy val client =
    new AmazonDynamoDBClient(Config.awsCredentials) <| (_ setRegion Config.dynamoRegion)

  val table = Config.leasesTable

  private def uuid = Some(UUID.randomUUID().toString)

  def put(lease: MediaLease) = Scanamo.put(client)(table)(lease.copy(id=uuid))
  def get(id: String) = Scanamo.get[String, MediaLease](client)(table)("id" -> id)
}

object MediaLeaseController extends Controller with ArgoHelpers {

  import lib.Config.rootUri

  def uri(u: String) = URI.create(u)
  val leasesUri = uri(s"$rootUri/lease")

  val appIndex = AppIndex("media-leases", "Media leases service")
  val indexLinks = List(Link("leases", leasesUri.toString))

  val Authenticated = ControllerHelper.Authenticated

  def index = Authenticated { _ => respond(appIndex, links = indexLinks) }

  def postLease = Authenticated(parse.json) { request =>
    request.body.validate[MediaLease].fold(
      e => {
        respondError(BadRequest, "media-lease-parse-failed", JsError.toFlatJson(e).toString)
      },
      mediaLease => {
        LeaseStore.put(mediaLease)

        Accepted
      }
    )
  }

  def deleteLease(id: String) = Authenticated.async { request =>
    Future { NotImplemented }
  }

  def getLease(id: String) = Authenticated.async { request =>
    Future {
      LeaseStore.get(id).map(_.toOption).flatten
        .map(lease => respond[MediaLease](data = lease))
        .getOrElse(respondNotFound("MediaLease not found"))
    }
  }
}
