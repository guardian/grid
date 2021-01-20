package controllers


import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth._
import com.gu.scanamo.error.DynamoReadError
import lib._
import model.{StatusType, UploadStatus}
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

class UploadStatusController(auth: Authentication,
                             store: UploadStatusTable,
                             override val controllerComponents: ControllerComponents,
                            )
                            (implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  def getUploadStatus(imageId: String) = auth.async {
    store.getStatus(imageId)
      .map {
        case Some(Right(record)) => respond(UploadStatus(record.status, record.errorMessage))
        case Some(Left(error)) => respondError(BadRequest, "cannot-get", s"Cannot get upload status ${error}")
        case None => respondNotFound(s"No upload status found for image id: ${imageId}")
      }
      .recover{ case error => respondError(InternalServerError, "cannot-get", s"Cannot get upload status ${error}") }
  }

  def updateUploadStatus(imageId: String) = auth.async(parse.json[UploadStatus]) { request =>
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
            case Left(error: DynamoReadError) => respondError(BadRequest, "cannot-update", s"Cannot update upload status ${error}")
          }
    }
  }
}
