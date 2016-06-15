package controllers

import java.net.URI

import com.amazonaws.services.dynamodbv2.model.DeleteItemResult

import scala.concurrent.Future
import scala.util.Try

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._

import play.api.libs.json._

import com.gu.mediaservice.model.{MediaLease, LeaseByMedia}

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._

import lib.{LeaseNotice, LeaseNotifier, LeaseStore, ControllerHelper}


case class AppIndex(
                     name: String,
                     description: String,
                     config: Map[String, String] = Map())
object AppIndex {
  implicit def jsonWrites: Writes[AppIndex] = Json.writes[AppIndex]
}

object MediaLeaseController extends Controller
  with ArgoHelpers
  with ControllerHelper {

  import lib.Config._

  val notFound = respondNotFound("MediaLease not found")


  val indexResponse = {
    val appIndex = AppIndex("media-leases", "Media leases service", Map())
    val indexLinks =  List(
      Link("leases", s"$rootUri/leases/{id}"),
      Link("by-media-id", s"$rootUri/leases/media/{id}"))
    respond(appIndex, indexLinks)
  }

  def index = Authenticated { _ => indexResponse }

  def postLease = Authenticated.async(parse.json) { implicit request => Future {
    request.body.validate[MediaLease].fold(
      e => {
        respondError(BadRequest, "media-lease-parse-failed", JsError.toFlatJson(e).toString)
      },
      mediaLease => {
        LeaseStore.put(mediaLease.copy(leasedBy = requestingUser)).map { _ =>
          LeaseNotifier.send(LeaseNotice.build(mediaLease.mediaId))
        }
        Accepted
      }
    )
  }}

  def deleteLease(id: String) = Authenticated.async { implicit request =>
    Future {
      LeaseStore.get(id).map { lease =>
        val mediaId = lease.mediaId
        LeaseStore.delete(id).map { _ =>
          LeaseNotifier.send(LeaseNotice.build(mediaId))
        }
      }
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

  def getLeasesForMedia(id: String) = Authenticated.async { request =>
    Future {
      val leases = LeaseStore.getForMedia(id)

      respond[LeaseByMedia](
        uri = leasesMediaUri(id),
        links = List(mediaApiLink(id)),
        data = LeaseByMedia.build(leases)
      )
    }
  }
}
