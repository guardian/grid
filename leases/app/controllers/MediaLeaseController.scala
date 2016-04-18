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


case class AppIndex(
                     name: String,
                     description: String,
                     config: Map[String, String] = Map(),
                     links: List[Link] = Nil)
object AppIndex {
  implicit def jsonWrites: Writes[AppIndex] = Json.writes[AppIndex]
}

object MediaLeaseController extends Controller with ArgoHelpers {

  import lib.ControllerHelper._
  import lib.Config._

  val notFound = respondNotFound("MediaLease not found")

  val appIndex = AppIndex(
    "media-leases",
    "Media leases service",
    Map(),
    List(Link("by-media-id", s"$rootUri/leases/media/{id}"))
  )
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
      val leases = LeaseStore.get(id)

      leases.foldLeft(notFound)((_, lease) => respond[MediaLease](
          uri = leaseUri(id),
          data = lease,
          links = lease.id
            .map(mediaApiLink)
            .toList
        ))
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

  case class LeaseByMedia(leases: List[MediaLease])
  case object LeaseByMedia {
    implicit val LeaseByMediaWrites = new Writes[LeaseByMedia] {
    def writes(leaseByMedia: LeaseByMedia) =
      JsObject(Seq(
        // TODO: calculate truth value from list
        "active" -> JsBoolean(true),
        "leases" -> Json.toJson(leaseByMedia.leases.map(wrapLease))
      ))
    }
  }

  def getLeasesForMedia(id: String) = Authenticated.async { request =>
    Future {
      val leases = LeaseStore.getForMedia(id)

      respond[LeaseByMedia](
        uri = leasesMediaUri(id),
        links = List(mediaApiLink(id)),
        data = LeaseByMedia(leases)
      )
    }
  }
}
