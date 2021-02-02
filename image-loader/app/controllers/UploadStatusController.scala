package controllers


import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth._
import lib._

import model.UploadStatus
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

class UploadStatusController(auth: Authentication,
                             store: UploadStatusTable,
                             override val controllerComponents: ControllerComponents,
                            )
                            (implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  def getUploadStatus(imageId: String) = auth.async { Future {
    store.getStatus(imageId)
    match {
      case Some(uploadStatus) => respond(uploadStatus.status)
      case None => respondNotFound(s"No upload status found for image id: ${imageId}")
    }
  }}

  def updateUploadStatus(imageId: String) = auth.async(parse.json) { request => {
    store.getStatus(imageId)
    match {
      case None => Future(respondNotFound(s"No upload status found for image id: ${imageId}"))
      case Some(uploadStatus) => {
        (request.body \ store.key).asOpt[UploadStatus].map(uploadStatus => {
          store.setStatus(imageId, uploadStatus)
            .map(_ => respond(uploadStatus))
        }).getOrElse(Future.successful(respondError(BadRequest, "invalid-status-data", "Invalid status data")))
      }
    }


  }}

}
