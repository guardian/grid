package controllers

import java.io.File

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.Json
import play.api.Logger

import org.joda.time.DateTime
import scala.concurrent.Future

import lib.{Config, Notifications}
import lib.storage.S3ImageStorage
import lib.imaging.MimeTypeDetection

import model.{Image, UploadRequest, ImageUpload}

import com.gu.mediaservice.lib.play.BodyParsers.digestedFile
import com.gu.mediaservice.lib.play.DigestedFile
import com.gu.mediaservice.lib.{auth, ImageStorage}
import com.gu.mediaservice.lib.resource.FutureResources._
import com.gu.mediaservice.lib.auth.{AuthenticatedService, PandaUser, KeyStore}
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link


object Application extends ImageLoader(S3ImageStorage)

class ImageLoader(storage: ImageStorage) extends Controller with ArgoHelpers {

  import Config.{rootUri, loginUri}
  import com.gu.mediaservice.lib.play.BodyParsers.digestedFile

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)

  val Authenticated = auth.Authenticated(keyStore, loginUri, rootUri)
  val AuthenticatedUpload = auth.AuthenticatedUpload(keyStore, loginUri, rootUri)


  val indexResponse = {
    val indexData = Map("description" -> "This is the Loader Service")
    val indexLinks = List(
      Link("load", s"$rootUri/images{?uploadedBy,identifiers}")
    )
    respond(indexData, indexLinks)
  }

  def index = Authenticated { indexResponse }

  def createTempFile = File.createTempFile("requestBody", "", new File(Config.tempDir))

  def loadImage(uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String]) =
    AuthenticatedUpload.async(digestedFile(createTempFile)) { request =>

    val DigestedFile(tempFile_, id_) = request.body

    // only allow AuthenticatedService to set with query string
    val uploadedBy_ = (request.user, uploadedBy) match {
      case (user: AuthenticatedService, Some(by)) => by
      case (user: PandaUser, _) => user.email
      case (user, _) => user.name
    }

    // TODO: should error if the JSON parsing failed
    val identifiers_ = identifiers.map(Json.parse(_).as[Map[String, String]]) getOrElse Map()

    // TODO: handle the error thrown by an invalid string to `DateTime`
    // only allow uploadTime to be set by AuthenticatedService
    val uploadTime_ = (request.user, uploadTime) match {
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
      identifiers = identifiers_
    )

    Logger.info(s"Received ${uploadRequestDescription(uploadRequest)}")

    val supportedMimeType = Config.supportedMimeTypes.exists(Some(_) == mimeType_)

    if (supportedMimeType) storeFile(uploadRequest) else unsupportedTypeError(uploadRequest)
  }

  def uploadRequestDescription(u: UploadRequest): String = {
    s"id: ${u.id}, by: ${u.uploadedBy} @ ${u.uploadTime}, mimeType: ${u.mimeType getOrElse "none"}"
  }

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
      imageUpload <- ImageUpload.fromUploadRequest(uploadRequest, storage)
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
        storage.deleteImage(uploadRequest.id)
        respondError(BadRequest, "upload-error", e.getMessage)
      }
    }
  }
}
