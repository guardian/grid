package controllers

import java.io.{File, FileOutputStream}
import java.net.URI
import java.util.UUID

import com.amazonaws.services.s3.model.S3Object
import com.gu.mediaservice.lib.ImageIngestOperations
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.aws.{S3Ops, UpdateMessage}
import com.gu.mediaservice.lib.net.{URI => MediaURI}
import com.gu.mediaservice.model.{Image, UploadInfo}
import lib._
import lib.imaging.MimeTypeDetection
import lib.storage.ImageLoaderStore
import model.{ImageUploadOps, ImageUploadProjector, S3FileExtractedMetadata, UploadRequest}
import net.logstash.logback.marker.Markers
import org.apache.tika.io.IOUtils
import org.joda.time.{DateTime, DateTimeZone}
import play.api.Logger
import play.api.libs.json.Json
import play.api.libs.ws.WSClient
import play.api.mvc._

import scala.collection.JavaConverters._
import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.util.control.NonFatal
import scala.util.{Failure, Success, Try}

case class RequestLoggingContext(requestId: UUID = UUID.randomUUID()) {
  def toMarker(extraMarkers: Map[String, String] = Map.empty) = Markers.appendEntries(
    (extraMarkers + ("requestId" -> requestId)).asJava
  )
}

class ImageLoaderController(auth: Authentication, downloader: Downloader, store: ImageLoaderStore, notifications: Notifications,
                            config: ImageLoaderConfig, imageUploadOps: ImageUploadOps, imageUploadProjector: ImageUploadProjector,
                            override val controllerComponents: ControllerComponents, wSClient: WSClient)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  val LOG_FALLBACK = "unknown"

  val indexResponse: Result = {
    val indexData = Map("description" -> "This is the Loader Service")
    val indexLinks = List(
      Link("load", s"${config.rootUri}/images{?uploadedBy,identifiers,uploadTime,filename}"),
      Link("import", s"${config.rootUri}/imports{?uri,uploadedBy,identifiers,uploadTime,filename}")
    )
    respond(indexData, indexLinks)
  }

  def index = auth {
    indexResponse
  }

  private def createTempFile(prefix: String, requestContext: RequestLoggingContext) = {
    Logger.info(s"creating temp file in ${config.tempDir}")(requestContext.toMarker())
    File.createTempFile(prefix, "", config.tempDir)
  }

  def loadImage(uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String], filename: Option[String]) = {
    val requestContext = RequestLoggingContext()

    val markers = Map(
      "uploadedBy" -> uploadedBy.getOrElse(LOG_FALLBACK),
      "identifiers" -> identifiers.getOrElse(LOG_FALLBACK),
      "uploadTime" -> uploadTime.getOrElse(LOG_FALLBACK),
      "filename" -> filename.getOrElse(LOG_FALLBACK)
    )

    Logger.info("loadImage request start")(requestContext.toMarker(markers))

    val parsedBody = DigestBodyParser.create(createTempFile("requestBody", requestContext))
    Logger.info("body parsed")(requestContext.toMarker(markers))

    auth.async(parsedBody) { req =>
      val result = loadFile(req.body, req.user, uploadedBy, identifiers, uploadTime, filename, requestContext)
      Logger.info("loadImage request end")(requestContext.toMarker(markers))
      result
    }
  }

  private def getSrcFileDigestForProjection(s3Src: S3Object, imageId: String) = {
    val uploadedFile = File.createTempFile(s"projection-${imageId}", "", config.tempDir)
    IOUtils.copy(s3Src.getObjectContent, new FileOutputStream(uploadedFile))
    DigestedFile(uploadedFile, imageId)
  }

  def projectImageBy(imageId: String) = {
    auth { _ =>
      projectS3ImageById(imageId) match {
        case Success(maybeImage) =>
          maybeImage match {
            case Some(img) => Ok(Json.toJson(img)).as(ArgoMediaType)
            case None =>
              val s3Path = "s3://" + config.imageBucket + ImageIngestOperations.fileKeyFromId(imageId)
              respondError(NotFound, "image-not-found", s"Could not find image: $imageId in s3 at $s3Path")
          }
        case Failure(error) =>
          respondError(InternalServerError, "image-projection-failed", error.getMessage)
      }
    }
  }

  def importImage(uri: String, uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String], filename: Option[String]) = {
    auth.async { request =>
      val requestContext = RequestLoggingContext()
      val apiKey = request.user.apiKey

      Logger.info("importImage request start")(requestContext.toMarker(Map(
        "key-tier" -> apiKey.tier.toString,
        "key-name" -> apiKey.name
      )))
      Try(URI.create(uri)) map { validUri =>
        val tmpFile = createTempFile("download", requestContext)

        val result = downloader.download(validUri, tmpFile).flatMap { digestedFile =>
          loadFile(digestedFile, request.user, uploadedBy, identifiers, uploadTime, filename, requestContext)
        } recover {
          case NonFatal(e) =>
            Logger.error(s"Unable to download image $uri", e)
            failedUriDownload
        }

        result onComplete (_ => tmpFile.delete())
        Logger.info("importImage request end")(requestContext.toMarker(Map(
          "key-tier" -> apiKey.tier.toString,
          "key-name" -> apiKey.name
        )))
        result

      } getOrElse {
        Logger.info("importImage request end")(requestContext.toMarker(Map(
          "key-tier" -> apiKey.tier.toString,
          "key-name" -> apiKey.name
        )))
        Future.successful(invalidUri)
      }
    }
  }

  private def projectS3ImageById(imageId: String): Try[Option[Image]] = {
    Logger.info(s"projecting image: $imageId")

    import ImageIngestOperations.fileKeyFromId
    val s3Key = fileKeyFromId(imageId)
    val s3 = S3Ops.buildS3Client(config)

    if (!s3.doesObjectExist(config.imageBucket, s3Key)) return Try(None)

    Logger.info(s"object exists, getting s3 object at s3://${config.imageBucket}/$s3Key to perform Image projection")

    val s3Source = s3.getObject(config.imageBucket, s3Key)
    val lastModified = s3Source.getObjectMetadata.getLastModified.toInstant.toString
    val digestedFile = getSrcFileDigestForProjection(s3Source, imageId)
    val fileUserMetadata = s3Source.getObjectMetadata.getUserMetadata.asScala.toMap

    val uploadedBy = fileUserMetadata.getOrElse("uploaded_by", "re-ingester")
    val uploadedTimeRaw = fileUserMetadata.getOrElse("upload_time", lastModified)
    val uploadTime = new DateTime(uploadedTimeRaw).withZone(DateTimeZone.UTC)
    val picdarUrn = fileUserMetadata.get("identifier!picdarurn")

    val uploadFileNameRaw = fileUserMetadata.get("file_name")
    // The file name is URL encoded in  S3 metadata
    val uploadFileName = uploadFileNameRaw.map(MediaURI.decode)

    val extractedS3Meta = S3FileExtractedMetadata(
      uploadedBy = uploadedBy,
      uploadTime = uploadTime,
      uploadFileName = uploadFileName,
      picdarUrn = picdarUrn,
    )

    Try {
      val finalImageFuture = imageUploadProjector.projectImage(digestedFile, extractedS3Meta)
      val finalImage = Await.result(finalImageFuture, Duration.Inf)
      Some(finalImage)
    }
  }

  def loadFile(digestedFile: DigestedFile, user: Principal,
               uploadedBy: Option[String], identifiers: Option[String],
               uploadTime: Option[String], filename: Option[String], requestContext: RequestLoggingContext): Future[Result] = {
    val DigestedFile(tempFile_, id_) = digestedFile

    val uploadedBy_ = uploadedBy match {
      case Some(by) => by
      case None => Authentication.getEmail(user)
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

    Logger.info("Detecting mimetype")(requestContext.toMarker())
    // Abort early if unsupported mime-type
    val mimeType_ = MimeTypeDetection.guessMimeType(tempFile_)
    Logger.info(s"Detected mimetype as ${mimeType_.getOrElse(LOG_FALLBACK)}")(requestContext.toMarker())

    val uploadRequest = UploadRequest(
      requestId = requestContext.requestId,
      imageId = id_,
      tempFile = tempFile_,
      mimeType = mimeType_,
      uploadTime = uploadTime_,
      uploadedBy = uploadedBy_,
      identifiers = identifiers_,
      uploadInfo = uploadInfo_
    )

    val supportedMimeType = config.supportedMimeTypes.exists(mimeType_.contains(_))

    if (supportedMimeType) storeFile(uploadRequest) else unsupportedTypeError(uploadRequest)
  }

  val invalidUri = respondError(BadRequest, "invalid-uri", s"The provided 'uri' is not valid")
  val failedUriDownload = respondError(BadRequest, "failed-uri-download", s"The provided 'uri' could not be downloaded")

  def unsupportedTypeError(u: UploadRequest): Future[Result] = Future {
    Logger.info(s"Rejected request to load file: mime-type is not supported")(u.toLogMarker)
    val mimeType = u.mimeType getOrElse "none"

    respondError(
      UnsupportedMediaType,
      "unsupported-type",
      s"Unsupported mime-type: $mimeType. Supported: ${config.supportedMimeTypes.mkString(", ")}"
    )
  }

  def storeFile(uploadRequest: UploadRequest): Future[Result] = {
    Logger.info("Storing file")(uploadRequest.toLogMarker)
    val result = for {
      imageUpload <- imageUploadOps.fromUploadRequest(uploadRequest)
      image = imageUpload.image
    } yield {
      val updateMessage = UpdateMessage(subject = "image", image = Some(image))
      notifications.publish(updateMessage)

      // TODO: centralise where all these URLs are constructed
      Accepted(Json.obj("uri" -> s"${config.apiUri}/images/${uploadRequest.imageId}")).as(ArgoMediaType)
    }

    result recover {
      case e =>
        Logger.warn(s"Failed to store file: ${e.getMessage}.", e)(uploadRequest.toLogMarker)

        store.deleteOriginal(uploadRequest.imageId).onComplete {
          case Failure(err) => Logger.error(s"Failed to delete image for ${uploadRequest.imageId}: $err")
          case _ =>
        }
        respondError(BadRequest, "upload-error", e.getMessage)
    }
  }

  // Find this a better home if used more widely
  implicit class NonEmpty(s: String) {
    def nonEmptyOpt: Option[String] = if (s.isEmpty) None else Some(s)
  }

}
