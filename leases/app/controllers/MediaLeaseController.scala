package controllers

import java.net.URI

import com.amazonaws.services.dynamodbv2.model.DeleteItemResult

import scala.concurrent.duration._
import scala.concurrent.Await
import scala.concurrent.Future
import scala.util.Try

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._

import play.api.libs.json._
import play.api.data.validation.ValidationError

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

  private def notify(mediaId: String) = LeaseNotifier.send(LeaseNotice.build(mediaId))

  private def clearLease(id: String) = LeaseStore.get(id).map { lease =>
    LeaseStore.delete(id).map { _ => notify(lease.mediaId) }
  }

  private def clearLeases(id: String) = LeaseStore.getForMedia(id)
    .flatMap(_.id)
    .map(clearLease)

  private def badRequest(e:  Seq[(JsPath, Seq[ValidationError])], msg: String) =
    respondError(BadRequest, "media-leases-parse-failed", JsError.toFlatJson(e).toString)

  private def addLease(mediaLease: MediaLease, userId: Option[String]) = LeaseStore
    .put(mediaLease.copy(leasedBy = userId)).map { _ =>
      notify(mediaLease.mediaId)
    }


  def reindex = Authenticated.async { _ => Future {
    LeaseStore.forEach { leases =>
      leases
        .foldLeft(Set[String]())((ids, lease) =>  ids + lease.mediaId)
        .map(notify)
    }

    Accepted
  }}

  def postLease = Authenticated.async(parse.json) { implicit request => Future {
    request.body.validate[MediaLease].fold(
      badRequest(_, "media-leases-parse-failed"),
      mediaLease => {
        addLease(mediaLease, requestingUser)

        Accepted
      }
    )
  }}


  def deleteLease(id: String) = Authenticated.async { implicit request =>
    Future {
      clearLease(id)

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
      clearLeases(id)

      Accepted
    }
  }

  def replaceLeasesForMedia(id: String) = Authenticated.async(parse.json) { implicit request => Future {
    request.body.validate[List[MediaLease]].fold(
      badRequest(_, "media-leases-parse-failed"),
      mediaLeases => {
        clearLeases(id)
        mediaLeases.map(addLease(_, requestingUser))

        Accepted
      }
    )
  }}

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
