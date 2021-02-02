package controllers


import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth._
import com.gu.scanamo.error.DynamoReadError
import lib._
import model.{UpdateUploadStatusRequest, UpdateUploadStatusResponse, UploadStatus}
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
        case Some(Right(uploadStatus)) => respond(UpdateUploadStatusResponse(uploadStatus.status))
        case Some(Left(error)) => respondError(BadRequest, "cannot-get", s"Cannot get upload status ${error}")
        case None => respondNotFound(s"No upload status found for image id: ${imageId}")
      }
  }

  def updateUploadStatus(imageId: String) = auth.async(parse.json) { request => {
    (request.body).asOpt[UpdateUploadStatusRequest].map(updateUploadStatusRequest => {
      store.updateStatus(imageId, updateUploadStatusRequest)
        .map{
          case Some(Right(_)) => respond(UpdateUploadStatusResponse(updateUploadStatusRequest.status))
          case Some(Left(error: DynamoReadError)) => respondError(BadRequest, "cannot-update", s"Cannot update upload status ${error}")
          case None => respondNotFound(s"No upload status found for image id: ${imageId}")
        }
    }).getOrElse(Future.successful(respondError(BadRequest, "invalid-status-data", "Invalid status data")))
  }}
}
