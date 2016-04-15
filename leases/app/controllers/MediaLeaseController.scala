package controllers

import java.net.URI

import scala.concurrent.Future
import scala.util.Try

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._

import play.api.libs.json._

import com.gu.mediaservice.model.MediaLease

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._

import lib.LeaseStore


case class AppIndex(name: String, description: String, config: Map[String, String] = Map())
object AppIndex {
  implicit def jsonWrites: Writes[AppIndex] = Json.writes[AppIndex]
}

object MediaLeaseController extends Controller with ArgoHelpers {

  import lib.ControllerHelper._
  import lib.Config._

  val appIndex = AppIndex("media-leases", "Media leases service")
  def index = Authenticated { _ => respond(appIndex) }

  def postLease = Authenticated.async(parse.json) { implicit request => Future {

    request.body.validate[MediaLease].fold(
      e => {
        respondError(BadRequest, "media-lease-parse-failed", JsError.toFlatJson(e).toString)
      },
      mediaLease => {
        LeaseStore.put(mediaLease.copy(leasedBy = requestingUser))
        Accepted
      }
    )
  }}

  def deleteLease(id: String) = Authenticated.async { request =>
    Future {
      LeaseStore.delete(id)
      Accepted
    }
  }

  def getLease(id: String) = Authenticated.async { request =>
    Future {
      LeaseStore.get(id).map(_.toOption).flatten
        .map(lease => respond[MediaLease](
          uri = leaseUri(id),
          data = lease,
          links = List(
            Link("media", mediaApiUri(lease.mediaId))
          )
        ))
        .getOrElse(respondNotFound("MediaLease not found"))
    }
  }

  def deleteLeasesForMedia(id: String) = Authenticated.async { request =>
    Future {
      LeaseStore.getForMedia(id)
        .flatMap(_.id)
        .map(LeaseStore.delete)

      Accepted
    }
  }

  def getLeasesForMedia(id: String) = Authenticated.async { request =>
    Future {
      val leases = LeaseStore.getForMedia(id)
      val uri = Try { URI.create(s"${leasesUri}/media/${id}") }.toOption

      val links = List(
        Link("media", mediaApiUri(id))
      )

      respondCollection[EntityReponse[MediaLease]](
        uri = uri,
        links = links,
        data = leases.map(wrapLease)
      )
    }
  }
}
