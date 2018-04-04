package controllers

import java.io.File
import java.net.URI

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.play.{DigestBodyParser, DigestedFile}
import com.gu.mediaservice.model.UploadInfo
import com.gu.pandomainauth.action.UserRequest
import com.gu.pandomainauth.model.User
import lib._
import lib.imaging.MimeTypeDetection
import lib.storage.ImageLoaderStore
import model.{ImageUploadOps, UploadRequest}
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.Json
import play.api.libs.ws.WSClient
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try
import scala.util.control.NonFatal

class ImageLoaderController(auth: Authentication, downloader: Downloader, store: ImageLoaderStore, notifications: Notifications, config: ImageLoaderConfig, imageUploadOps: ImageUploadOps,
                            override val controllerComponents: ControllerComponents, wSClient: WSClient)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  val keyStore = new KeyStore(config.keyStoreBucket, config)

  val indexResponse: Result = {
    val indexData = Map("description" -> "This is the Loader Service")
    val indexLinks = List(
      Link("load",   s"${config.rootUri}/images{?uploadedBy,identifiers,uploadTime,filename}"),
      Link("import", s"${config.rootUri}/imports{?uri,uploadedBy,identifiers,uploadTime,filename}")
    )
    respond(indexData, indexLinks)
  }

  def index = auth { indexResponse }

  def createTempFile(prefix: String) = File.createTempFile(prefix, "", config.tempDir)

  def loadImage(uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String], filename: Option[String]) =
    auth.AuthAction.async(DigestBodyParser.create(createTempFile("requestBody"))) { req =>
      loadFile(uploadedBy, identifiers, uploadTime, filename)(req)
    }

  def importImage(uri: String, uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String], filename: Option[String]) =
    auth.AuthAction.async { request =>
      Try(URI.create(uri)) map { validUri =>
        val tmpFile = createTempFile("download")

        val result = downloader.download(validUri, tmpFile).flatMap { digestedFile =>
          loadFile(digestedFile, request.user, uploadedBy, identifiers, uploadTime, filename)
        } recover {
          case NonFatal(e) => failedUriDownload
        }

        result onComplete (_ => tmpFile.delete())
        result

      } getOrElse Future.successful(invalidUri)
    }

  def loadFile(digestedFile: DigestedFile, user: User,
               uploadedBy: Option[String], identifiers: Option[String],
               uploadTime: Option[String], filename: Option[String]): Future[Result] = {
    val DigestedFile(tempFile_, id_) = digestedFile

    val uploadedBy_ = uploadedBy match {
      case Some(by) => by
      case None => user.email
    }

    // TODO: should error if the JSON parsing failed
    val identifiers_ = identifiers.map(Json.parse(_).as[Map[String, String]]) getOrElse Map()

    val uploadInfo_ = UploadInfo(filename.flatMap(_.trim.nonEmptyOpt))

    // TODO: handle the error thrown by an invalid string to `DateTime`
    // only allow uploadTime to be set by AuthenticatedService
    val uploadTime_ = uploadTime match {
      case Some(time) => new DateTime(time)
      case None => DateTime.now
    }

    // Abort early if unsupported mime-type
    val mimeType_ = MimeTypeDetection.guessMimeType(tempFile_)

    val uploadRequest = UploadRequest(
      id = id_,
      tempFile = tempFile_,
      mimeType = mimeType_,
      uploadTime = uploadTime_,
      uploadedBy = uploadedBy_,
      identifiers = identifiers_,
      uploadInfo = uploadInfo_
    )

    Logger.info(s"Received ${uploadRequestDescription(uploadRequest)}")

    val supportedMimeType = config.supportedMimeTypes.exists(mimeType_.contains(_))

    if (supportedMimeType) storeFile(uploadRequest) else unsupportedTypeError(uploadRequest)
  }

  // Convenience alias
  private def loadFile(uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String],
               filename: Option[String])
              (request: UserRequest[DigestedFile]): Future[Result] =
    loadFile(request.body, request.user, uploadedBy, identifiers, uploadTime, filename)


  def uploadRequestDescription(u: UploadRequest): String = {
    s"id: ${u.id}, by: ${u.uploadedBy} @ ${u.uploadTime}, mimeType: ${u.mimeType getOrElse "none"}, filename: ${u.uploadInfo.filename getOrElse "none"}"
  }

  val invalidUri        = respondError(BadRequest, "invalid-uri", s"The provided 'uri' is not valid")
  val failedUriDownload = respondError(BadRequest, "failed-uri-download", s"The provided 'uri' could not be downloaded")

  def unsupportedTypeError(u: UploadRequest): Future[Result] = Future {
    Logger.info(s"Rejected ${uploadRequestDescription(u)}: mime-type is not supported")
    val mimeType = u.mimeType getOrElse "none"

    respondError(
      UnsupportedMediaType,
      "unsupported-type",
      s"Unsupported mime-type: $mimeType. Supported: ${config.supportedMimeTypes.mkString(", ")}"
    )
  }

  def storeFile(uploadRequest: UploadRequest): Future[Result] = {
    val result = for {
      imageUpload <- imageUploadOps.fromUploadRequest(uploadRequest)
      image = imageUpload.image
    } yield {
      notifications.publish(Json.toJson(image), "image")
      // TODO: centralise where all these URLs are constructed
      Accepted(Json.obj("uri" -> s"${config.apiUri}/images/${uploadRequest.id}")).as(ArgoMediaType)
    }

    result recover {
      case e =>
        Logger.warn(s"Rejected ${uploadRequestDescription(uploadRequest)}: ${e.getMessage}.", e)

        // TODO: Log when an image isn't deleted
        store.deleteOriginal(uploadRequest.id)
        respondError(BadRequest, "upload-error", e.getMessage)
    }
  }


  // Find this a better home if used more widely
  implicit class NonEmpty(s: String) {
    def nonEmptyOpt: Option[String] = if (s.isEmpty) None else Some(s)
  }
}
