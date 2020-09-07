package controllers

import java.util.UUID

import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.model.leases.{LeasesByMedia, MediaLease}
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

  private def clearLease(id: String) = store.get(id).map { lease =>
    store.delete(id).map { _ => notifications.sendRemoveLease(lease.mediaId, id)}
  }

  private def clearLeases(id: String) = Future.sequence(store.getForMedia(id)
    .flatMap(_.id)
    .flatten(clearLease))

  private def badRequest(e:  Seq[(JsPath, Seq[JsonValidationError])]) =
    respondError(BadRequest, "media-leases-parse-failed", JsError.toJson(e).toString)

  private def prepareLeaseForSave(mediaLease: MediaLease, userId: Option[String]): MediaLease =
    mediaLease.prepareForSave.copy(id = Some(UUID.randomUUID().toString), leasedBy = userId)

  private def addLease(mediaLease: MediaLease, userId: Option[String]) = {
    val lease = prepareLeaseForSave(mediaLease, userId)
    if (lease.isSyndication) {
      val leasesForMedia = store.getForMedia(mediaLease.mediaId)
      val leasesWithoutSyndication = leasesForMedia.filter(!_.isSyndication)
      replaceLeases(leasesWithoutSyndication :+ lease, mediaLease.mediaId, userId)
    } else {
      store.put(lease).map { _ =>
        notifications.sendAddLease(lease)
      }
    }
  }

  private def replaceLeases(mediaLeases: List[MediaLease], imageId: String, userId: Option[String]) = {
    val preparedMediaLeases = mediaLeases.map(prepareLeaseForSave(_, userId))
    for {
      _ <- clearLeases(imageId)
      _ <- store.putAll(preparedMediaLeases)
    } yield {
      notifications.sendAddLeases(preparedMediaLeases, imageId)
    }
  }

  def index = auth { _ => indexResponse }

  def reindex = auth.async { _ => Future {
    store.forEach { leases =>
      leases
        .foldLeft(Set[String]())((ids, lease) =>  ids + lease.mediaId)
        .foreach(notifications.sendReindexLeases)
    }
    Accepted
  }}

  def postLease = auth.async(parse.json) { implicit request =>
    request.body.validate[MediaLease] match {
      case JsSuccess(mediaLease, _) =>
        addLease(mediaLease, Some(Authentication.getIdentity(request.user))).map(_ => Accepted)

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

  def validateLeases(leases: List[MediaLease]) = leases.count { _.isSyndication } <= 1

  def replaceLeasesForMedia(id: String) = auth.async(parse.json) { implicit request => Future {
    request.body.validate[List[MediaLease]].fold(
      badRequest,
      mediaLeases => {
        if (validateLeases(mediaLeases)) {
          replaceLeases(mediaLeases, id, Some(Authentication.getIdentity(request.user)))
          Accepted
        } else {
          respondError(BadRequest, "validation-error", "No more than one syndication lease per image")
        }
      }
    )
  }}

  def getLeasesForMedia(id: String) = auth.async { _ => Future {
      val leases = store.getForMedia(id)

      respond[LeasesByMedia](
        uri = config.leasesMediaUri(id),
        links = List(config.mediaApiLink(id)),
        data = LeasesByMedia.build(leases)
      )
    }
  }
}
