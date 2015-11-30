package controllers

import java.io.File
import java.net.URI

import com.gu.mediaservice.model.UploadInfo
import model.{ImageUpload, UploadRequest}
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.Json
import play.api.Logger

import org.joda.time.DateTime
import scala.concurrent.Future

import lib.{Downloader, Config, Notifications}
import lib.storage.ImageStore
import lib.imaging.MimeTypeDetection

import com.gu.mediaservice.lib.play.DigestBodyParser
import com.gu.mediaservice.lib.play.DigestedFile
import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.{Principal, AuthenticatedService, PandaUser, KeyStore}
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link

import scala.util.Try
import scala.util.control.NonFatal


object Application extends ImageLoader

class ImageLoader extends Controller with ArgoHelpers {

  import Config.{rootUri, loginUriTemplate}

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)

  val Authenticated = auth.Authenticated(keyStore, loginUriTemplate, rootUri)
  val AuthenticatedUpload = auth.AuthenticatedUpload(keyStore, loginUriTemplate, rootUri)


  val indexResponse = {
    val indexData = Map("description" -> "This is the Loader Service")
    val indexLinks = List(
      Link("load",   s"$rootUri/images{?uploadedBy,identifiers,uploadTime,filename}"),
      Link("import", s"$rootUri/imports{?uri,uploadedBy,identifiers,uploadTime,filename}")
    )
    respond(indexData, indexLinks)
  }

  def index = Authenticated { indexResponse }

  def createTempFile(prefix: String) = File.createTempFile(prefix, "", new File(Config.tempDir))

  def loadImage(uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String], filename: Option[String]) =
    AuthenticatedUpload.async(DigestBodyParser.create(createTempFile("requestBody")))(loadFile(uploadedBy, identifiers, uploadTime, filename))

  def importImage(uri: String, uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String], filename: Option[String]) =
    Authenticated.async { request =>
      Try(URI.create(uri)) map { validUri =>
        val tmpFile = createTempFile("download")

        val result = Downloader.download(validUri, tmpFile).flatMap { digestedFile =>
          loadFile(digestedFile, request.user, uploadedBy, identifiers, uploadTime, filename)
        } recover {
          case NonFatal(e) => failedUriDownload
        }

        result onComplete (_ => tmpFile.delete())
        result

      } getOrElse Future.successful(invalidUri)
    }

  def loadFile(digestedFile: DigestedFile, user: Principal,
               uploadedBy: Option[String], identifiers: Option[String],
               uploadTime: Option[String], filename: Option[String]): Future[Result] = {
    val DigestedFile(tempFile_, id_) = digestedFile

    // only allow AuthenticatedService to set with query string
    val uploadedBy_ = (user, uploadedBy) match {
      case (user: AuthenticatedService, Some(by)) => by
      case (user: PandaUser, _) => user.email
      case (user, _) => user.name
    }

    // TODO: should error if the JSON parsing failed
    val identifiers_ = identifiers.map(Json.parse(_).as[Map[String, String]]) getOrElse Map()

    val uploadInfo_ = UploadInfo(filename.flatMap(_.trim.nonEmptyOpt))

    // TODO: handle the error thrown by an invalid string to `DateTime`
    // only allow uploadTime to be set by AuthenticatedService
    val uploadTime_ = (user, uploadTime) match {
      case (user: AuthenticatedService, Some(time)) => new DateTime(time)
      case (_, _) => DateTime.now
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

    val supportedMimeType = Config.supportedMimeTypes.exists(Some(_) == mimeType_)

    if (supportedMimeType) storeFile(uploadRequest) else unsupportedTypeError(uploadRequest)
  }

  // Convenience alias
  def loadFile(uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String],
               filename: Option[String])
              (request: AuthenticatedRequest[DigestedFile, Principal]): Future[Result] =
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
      s"Unsupported mime-type: $mimeType. Supported: ${Config.supportedMimeTypes.mkString(", ")}"
    )
  }

  def storeFile(uploadRequest: UploadRequest): Future[Result] = {
    import Config.apiUri

    val result = for {
      imageUpload <- ImageUpload.fromUploadRequest(uploadRequest)
      image        = imageUpload.image
    } yield {
      Notifications.publish(Json.toJson(image), "image")
      // TODO: centralise where all these URLs are constructed
      Accepted(Json.obj("uri" -> s"$apiUri/images/${uploadRequest.id}")).as(ArgoMediaType)
    }

    result recover {
      case e => {
        Logger.info(s"Rejected ${uploadRequestDescription(uploadRequest)}: ${e.getMessage}.")

        // TODO: Log when an image isn't deleted
        ImageStore.deleteOriginal(uploadRequest.id)
        respondError(BadRequest, "upload-error", e.getMessage)
      }
    }
  }


  // Find this a better home if used more widely
  implicit class NonEmpty(s: String) {
    def nonEmptyOpt: Option[String] = if (s.isEmpty) None else Some(s)
  }
}
