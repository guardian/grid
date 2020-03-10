package lib.imaging

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.logging.{FALLBACK, RequestLoggingContext}
import com.gu.mediaservice.model.UploadInfo
import lib.{DigestedFile, FailureResponse, ImageLoaderConfig, Notifications}
import model.{ImageUploadOps, UploadRequest}
import net.logstash.logback.marker.LogstashMarker
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.Json
import play.api.mvc.Result
import com.gu.mediaservice.lib.argo.ArgoHelpers
import lib.storage.ImageLoaderStore

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Failure

class Importer(
                val config: ImageLoaderConfig,
                val imageUploadOps: ImageUploadOps,
                val notifications: Notifications,
                val store: ImageLoaderStore) extends ArgoHelpers {

  def loadFile(digestedFile: DigestedFile,
                       user: Principal,
                       uploadedBy: Option[String],
                       identifiers: Option[String],
                       uploadTime: DateTime,
                       filename: Option[String],
                       requestLoggingContext:
                       RequestLoggingContext)(implicit ec:ExecutionContext): Future[Result] = {
    val DigestedFile(tempFile_, id_) = digestedFile

    val uploadedBy_ = uploadedBy match {
      case Some(by) => by
      case None => Authentication.getIdentity(user)
    }

    // TODO: should error if the JSON parsing failed
    val identifiers_ = identifiers.map(Json.parse(_).as[Map[String, String]]) getOrElse Map()

    val uploadInfo_ = UploadInfo(filename)

    Logger.info("Detecting mimetype")(requestLoggingContext.toMarker())
    // Abort early if unsupported mime-type
    val mimeType_ = MimeTypeDetection.guessMimeType(tempFile_)
    Logger.info(s"Detected mimetype as ${mimeType_.getOrElse(FALLBACK)}")(requestLoggingContext.toMarker())

    val uploadRequest = UploadRequest(
      requestId = requestLoggingContext.requestId,
      imageId = id_,
      tempFile = tempFile_,
      mimeType = mimeType_,
      uploadTime = uploadTime,
      uploadedBy = uploadedBy_,
      identifiers = identifiers_,
      uploadInfo = uploadInfo_
    )

    val supportedMimeType = config.supportedMimeTypes.exists(mimeType_.contains(_))

    if (supportedMimeType) {
      storeFile(uploadRequest, requestLoggingContext)
    } else {
      Future {
        FailureResponse.unsupportedMimeType(uploadRequest, config.supportedMimeTypes)
      }
    }
  }

  private def storeFile(uploadRequest: UploadRequest, requestLoggingContext: RequestLoggingContext)(implicit ec:ExecutionContext): Future[Result] = {
    val completeMarkers: LogstashMarker = requestLoggingContext.toMarker().and(uploadRequest.toLogMarker)

    Logger.info("Storing file")(completeMarkers)
    val result = for {
      imageUpload <- imageUploadOps.fromUploadRequest(uploadRequest, requestLoggingContext)
      image = imageUpload.image
    } yield {
      val updateMessage = UpdateMessage(subject = "image", image = Some(image))
      notifications.publish(updateMessage)

      // TODO: centralise where all these URLs are constructed
      Accepted(Json.obj("uri" -> s"${config.apiUri}/images/${uploadRequest.imageId}")).as(ArgoMediaType)
    }

    result recover {
      case e =>
        Logger.warn(s"Failed to store file: ${e.getMessage}.", e)(completeMarkers)

        store.deleteOriginal(uploadRequest.imageId).onComplete {
          case Failure(err) => Logger.error(s"Failed to delete image for ${uploadRequest.imageId}: $err")(completeMarkers)
          case _ =>
        }
        respondError(BadRequest, "upload-error", e.getMessage)
    }
  }

}
