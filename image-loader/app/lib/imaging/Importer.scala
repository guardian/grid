package lib.imaging

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.logging.{FALLBACK, RequestLoggingContext}
import com.gu.mediaservice.model.UploadInfo
import lib.{DigestedFile, ImageLoaderConfig, Notifications}
import model.{ImageUploadOps, UploadRequest}
import net.logstash.logback.marker.LogstashMarker
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.{JsObject, Json}
import com.gu.mediaservice.lib.argo.ArgoHelpers
import lib.storage.ImageLoaderStore

import scala.concurrent.{ExecutionContext, Future}

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
               RequestLoggingContext)(implicit ec:ExecutionContext): Future[UploadRequest] = {
    val DigestedFile(tempFile_, id_) = digestedFile

    // Abort early if unsupported mime-type
    val guessedMimeType = MimeTypeDetection.guessMimeType(tempFile_)
    Logger.info(s"Detected mimetype as ${guessedMimeType.getOrElse(FALLBACK)}")(requestLoggingContext.toMarker())
    val supportedMimeType = config.supportedMimeTypes.exists(guessedMimeType.contains(_))
    if (!supportedMimeType)
      throw new UnsupportedMimeTypeException(guessedMimeType.getOrElse("Not Provided"))

    val uploadedBy_ = uploadedBy match {
      case Some(by) => by
      case None => Authentication.getIdentity(user)
    }

    // TODO: should error if the JSON parsing failed
    val identifiersMap = identifiers.map(Json.parse(_).as[Map[String, String]]) getOrElse Map()

    Future.successful(UploadRequest(
      requestId = requestLoggingContext.requestId,
      imageId = id_,
      tempFile = tempFile_,
      mimeType = guessedMimeType,
      uploadTime = uploadTime,
      uploadedBy = uploadedBy_,
      identifiers = identifiersMap,
      uploadInfo = UploadInfo(filename)
    ))

  }

  def storeFile(uploadRequest: UploadRequest)(implicit requestLoggingContext: RequestLoggingContext, ec:ExecutionContext): Future[JsObject] = {
    val completeMarkers: LogstashMarker = requestLoggingContext.toMarker().and(uploadRequest.toLogMarker)

    Logger.info("Storing file")(completeMarkers)
    for {
      imageUpload <- imageUploadOps.fromUploadRequest(uploadRequest, requestLoggingContext)
      updateMessage = UpdateMessage(subject = "image", image = Some(imageUpload.image))
      _ <- Future { notifications.publish(updateMessage) }
      // TODO: centralise where all these URLs are constructed
      uri = s"${config.apiUri}/images/${uploadRequest.imageId}"
    } yield {
      Json.obj("uri" -> uri)
    }

  }
}
