package controllers


import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.auth.Authentication.{InnerServicePrincipal, MachinePrincipal}
import lib._
import model.{StatusType, UploadStatus}
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
  extends BaseController with ArgoHelpers {

  def getUploadStatus(imageId: String) = auth.async {
    store.getStatus(imageId)
      .map {
        case Some(Right(record)) => respond(UploadStatus(record.status, record.errorMessage),
          uri = Some(URI.create(s"${config.apiUri}/images/${imageId}")))
        case Some(Left(error)) => respondError(BadRequest, "cannot-get", s"Cannot get upload status ${error}")
        case None => respondNotFound(s"No upload status found for image id: ${imageId}")
      }
      .recover{ case error => respondError(InternalServerError, "cannot-get", s"Cannot get upload status ${error}") }
  }

  private val machineOnly = new ActionFilter[Authentication.Request] {
    override protected def filter[A](request: Authentication.Request[A]): Future[Option[Result]] =
      Future.successful(request.user match {
        case MachinePrincipal(ApiAccessor(_, Internal), _) => None
        case InnerServicePrincipal(_, _) => None
        case _ => Some(respondError(Forbidden, "permission-denied", "Only internal services can update upload status"))
      })
    override protected def executionContext: ExecutionContext = ec
  }

  def updateUploadStatus(imageId: String) = (auth andThen machineOnly).async(parse.json[UploadStatus]) { request =>
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
    val identity = req.user.accessor.identity
    maybeUser match {
      case Some(user) if !user.equalsIgnoreCase(identity) =>
        Future.successful(respondError(
          Forbidden,
          "permission-denied",
          "You do not have permission to view uploads for another user"
        ))
      case _ =>
        store.queryByUser(identity).map(list => respond(list))
    }
  }
}
