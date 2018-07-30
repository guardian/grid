package controllers

import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.model.{LeaseByMedia, MediaLease}
import lib.{LeaseNotifier, LeaseStore, LeasesConfig}
import play.api.libs.json._
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

case class AppIndex(name: String,
                    description: String,
                    config: Map[String, String] = Map())
object AppIndex {
  implicit def jsonWrites: Writes[AppIndex] = Json.writes[AppIndex]
}

class MediaLeaseController(auth: Authentication, store: LeaseStore, config: LeasesConfig, notifications: LeaseNotifier,
                          override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  private val notFound = respondNotFound("MediaLease not found")

  private val indexResponse = {
    val appIndex = AppIndex("media-leases", "Media leases service", Map())
    val indexLinks =  List(
      Link("leases", s"${config.rootUri}/leases/{id}"),
      Link("by-media-id", s"${config.rootUri}/leases/media/{id}"))
    respond(appIndex, indexLinks)
  }

  private def notify(mediaId: String): Unit =  notifications.send(mediaId)

  private def clearLease(id: String) = store.get(id).map { lease =>
    store.delete(id).map { _ => notify(lease.mediaId) }
  }

  private def clearLeases(id: String) = store.getForMedia(id)
    .flatMap(_.id)
    .map(clearLease)

  private def badRequest(e:  Seq[(JsPath, Seq[JsonValidationError])]) =
    respondError(BadRequest, "media-leases-parse-failed", JsError.toJson(e).toString)

  private def addLease(mediaLease: MediaLease, userId: Option[String]) = store
    .put(mediaLease.prepareForSave.copy(leasedBy = userId)).map { _ =>
      notify(mediaLease.mediaId)
    }

  def index = auth { _ => indexResponse }

  def reindex = auth.async { _ => Future {
    store.forEach { leases =>
      leases
        .foldLeft(Set[String]())((ids, lease) =>  ids + lease.mediaId)
        .foreach(notify)
    }
    Accepted
  }}

  def postLease = auth.async(parse.json) { implicit request =>
    request.body.validate[MediaLease] match {
      case JsSuccess(mediaLease, _) =>
        addLease(mediaLease, Some(Authentication.getEmail(request.user))).map(_ => Accepted)

      case JsError(errors) =>
        Future.successful(badRequest(errors))
    }
  }

  def deleteLease(id: String) = auth.async { implicit request => Future {
      clearLease(id)
      Accepted
    }
  }

  def getLease(id: String) = auth.async { _ => Future {
      val leases = store.get(id)

      leases.foldLeft(notFound)((_, lease) => respond[MediaLease](
          uri = config.leaseUri(id),
          data = lease,
          links = lease.id
            .map(config.mediaApiLink)
            .toList
        ))
    }
  }


  def deleteLeasesForMedia(id: String) = auth.async { _ => Future {
      clearLeases(id)
      Accepted
    }
  }

  def replaceLeasesForMedia(id: String) = auth.async(parse.json) { implicit request => Future {
    request.body.validate[List[MediaLease]].fold(
      badRequest,
      mediaLeases => {
        clearLeases(id)
        mediaLeases.map(addLease(_, Some(Authentication.getEmail(request.user))))
        Accepted
      }
    )
  }}

  def getLeasesForMedia(id: String) = auth.async { _ => Future {
      val leases = store.getForMedia(id)

      respond[LeaseByMedia](
        uri = config.leasesMediaUri(id),
        links = List(config.mediaApiLink(id)),
        data = LeaseByMedia.build(leases)
      )
    }
  }
}
