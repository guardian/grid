package controllers


import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.config.InstanceForRequest
import lib._
import model.{StatusType, UploadStatus}
import com.gu.mediaservice.model.Instance
import org.scanamo.{ConditionNotMet, ScanamoError}
import play.api.mvc._

import java.net.URI
import scala.concurrent.{ExecutionContext, Future}

class UploadStatusController(auth: Authentication,
                             store: UploadStatusTable,
                             val config: ImageLoaderConfig,
                             override val controllerComponents: ControllerComponents,
                             authorisation: Authorisation
                            )
                            (implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers with InstanceForRequest {

  def getUploadStatus(imageId: String) = auth.async { request =>
    implicit val instance: Instance = instanceOf(request)
    store.getStatus(imageId)
      .map {
        case Some(Right(record)) => respond(UploadStatus(record.status, record.errorMessage),
          uri = Some(URI.create(s"${config.apiUri(instance)}/images/$imageId")))
        case Some(Left(error)) => respondError(BadRequest, "cannot-get", s"Cannot get upload status ${error}")
        case None => respondNotFound(s"No upload status found for image id: ${imageId}")
      }
      .recover{ case error => respondError(InternalServerError, "cannot-get", s"Cannot get upload status ${error}") }
  }

  def updateUploadStatus(imageId: String) = (auth andThen authorisation.CommonActionFilters.authorisedForUpload).async(parse.json[UploadStatus]) { request =>
    request.body match {
      case UploadStatus(StatusType.Failed, None) =>
        Future.successful(respondError(
          BadRequest,
          "missing-error-message",
          "When an upload status is being set to FAILED an errorMessage must be provided"
        ))
      case uploadStatus =>
        store
          .updateStatus(imageId, uploadStatus)
          .map{
            case Right(record) => respond(UploadStatus(record.status, record.errorMessage))
            case Left(_: ConditionNotMet) => respondError(BadRequest, "cannot-update", s"Cannot update as no upload status for $imageId exists")
            case Left(error: ScanamoError) => respondError(BadRequest, "cannot-update", s"Cannot update upload status ${error}")
          }
    }
  }

  def getCurrentUserUploads: Action[AnyContent] = getUploads(None)

  def getUploadsBy(user:String): Action[AnyContent] = getUploads(Some(user))

  private def getUploads(maybeUser: Option[String]): Action[AnyContent] = auth.async { req =>
    store.queryByUser(maybeUser.getOrElse(req.user.accessor.identity))
      .map(list => respond(list))
  }
}
