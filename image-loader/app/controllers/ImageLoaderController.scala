package controllers

import java.io.{File, FileOutputStream}
import java.net.URI

import com.amazonaws.services.s3.model.S3Object
import com.gu.mediaservice.lib.{DateTimeUtils, ImageIngestOperations}
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.aws.{S3Ops, UpdateMessage}
import com.gu.mediaservice.lib.logging.{FALLBACK, RequestLoggingContext}
import com.gu.mediaservice.model.{Image, UploadInfo}
import lib._
import lib.imaging.MimeTypeDetection
import lib.storage.ImageLoaderStore
import model.{ImageUploadOps, ImageUploadProjector, S3FileExtractedMetadata, UploadRequest}
import net.logstash.logback.marker.LogstashMarker
import org.apache.tika.io.IOUtils
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.Json
import play.api.libs.ws.WSClient
import play.api.mvc._

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.util.control.NonFatal
import scala.util.{Failure, Success, Try}

class ImageLoaderController(auth: Authentication, downloader: Downloader, store: ImageLoaderStore, notifications: Notifications,
                            config: ImageLoaderConfig, imageUploadOps: ImageUploadOps, imageUploadProjector: ImageUploadProjector,
                            override val controllerComponents: ControllerComponents, wSClient: WSClient)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

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
    val requestContext = RequestLoggingContext(
      initialMarkers = Map(
        "requestType" -> "load-image"
      )
    )

    val markers = Map(
      "uploadedBy" -> uploadedBy.getOrElse(FALLBACK),
      "identifiers" -> identifiers.getOrElse(FALLBACK),
      "uploadTime" -> uploadTime.getOrElse(FALLBACK),
      "filename" -> filename.getOrElse(FALLBACK)
    )

    Logger.info("loadImage request start")(requestContext.toMarker(markers))

    val parsedBody = DigestBodyParser.create(createTempFile("requestBody", requestContext))
    Logger.info("body parsed")(requestContext.toMarker(markers))

    auth.async(parsedBody) { req =>
      val result = loadFile(req.body, req.user, uploadedBy, identifiers, DateTimeUtils.fromValueOrNow(uploadTime), filename, requestContext)
      Logger.info("loadImage request end")(requestContext.toMarker(markers))
      result
    }
  }

  private def getSrcFileDigestForProjection(s3Src: S3Object, imageId: String, requestLoggingContext: RequestLoggingContext) = {
    val uploadedFile = createTempFile(s"projection-${imageId}", requestLoggingContext)
    IOUtils.copy(s3Src.getObjectContent, new FileOutputStream(uploadedFile))
    DigestedFile(uploadedFile, imageId)
  }

  def projectImageBy(imageId: String) = {
    val requestContext = RequestLoggingContext(
      initialMarkers = Map(
        "imageId" -> imageId,
        "requestType" -> "image-projection"
      )
    )

    auth { _ =>
      projectS3ImageById(imageId, requestContext) match {
        case Success(maybeImage) =>
          maybeImage match {
            case Some(img) => {
              Logger.info("image found")(requestContext.toMarker())
              Ok(Json.toJson(img)).as(ArgoMediaType)
            }
            case None =>
              val s3Path = "s3://" + config.imageBucket + "/" + ImageIngestOperations.fileKeyFromId(imageId)
              Logger.info("image not found")(requestContext.toMarker())
              respondError(NotFound, "image-not-found", s"Could not find image: $imageId in s3 at $s3Path")
          }
        case Failure(error) => {
          Logger.error(s"image projection failed", error)(requestContext.toMarker())
          respondError(InternalServerError, "image-projection-failed", error.getMessage)
        }
      }
    }
  }

  def importImage(uri: String, uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String], filename: Option[String]) = {
    auth.async { request =>
      val requestContext = RequestLoggingContext(
        initialMarkers = Map(
          "requestType" -> "import-image"
        )
      )
      val apiKey = request.user.accessor

      Logger.info("importImage request start")(requestContext.toMarker(Map(
        "key-tier" -> apiKey.tier.toString,
        "key-name" -> apiKey.identity
      )))
      Try(URI.create(uri)) map { validUri =>
        val tmpFile = createTempFile("download", requestContext)

        val result = downloader.download(validUri, tmpFile).flatMap { digestedFile =>
          loadFile(digestedFile, request.user, uploadedBy, identifiers, DateTimeUtils.fromValueOrNow(uploadTime), filename, requestContext)
        } recover {
          case NonFatal(e) =>
            Logger.error(s"Unable to download image $uri", e)
            // Need to delete this here as a failure response will never have its onComplete method called.
            tmpFile.delete()
            FailureResponse.failedUriDownload
        }

        result onComplete (_ => tmpFile.delete())
        Logger.info("importImage request end")(requestContext.toMarker(Map(
          "key-tier" -> apiKey.tier.toString,
          "key-name" -> apiKey.identity
        )))
        result

      } getOrElse {
        Logger.info("importImage request end")(requestContext.toMarker(Map(
          "key-tier" -> apiKey.tier.toString,
          "key-name" -> apiKey.identity
        )))
        Future.successful(FailureResponse.invalidUri)
      }
    }
  }

  private def projectS3ImageById(imageId: String, requestLoggingContext: RequestLoggingContext): Try[Option[Image]] = {
    Logger.info(s"projecting image: $imageId")(requestLoggingContext.toMarker())

    import ImageIngestOperations.fileKeyFromId
    val s3Key = fileKeyFromId(imageId)
    val s3 = S3Ops.buildS3Client(config)

    if (!s3.doesObjectExist(config.imageBucket, s3Key)) return Try(None)

    Logger.info(s"object exists, getting s3 object at s3://${config.imageBucket}/$s3Key to perform Image projection")(requestLoggingContext.toMarker())

    val s3Source = s3.getObject(config.imageBucket, s3Key)
    val digestedFile = getSrcFileDigestForProjection(s3Source, imageId, requestLoggingContext)
    val extractedS3Meta = S3FileExtractedMetadata(s3Source.getObjectMetadata)

    Try {
      val finalImageFuture = imageUploadProjector.projectImage(digestedFile, extractedS3Meta, requestLoggingContext)
      val finalImage = Await.result(finalImageFuture, Duration.Inf)
      Some(finalImage)
    }
  }

  private def loadFile(digestedFile: DigestedFile, user: Principal,
               uploadedBy: Option[String], identifiers: Option[String],
               uploadTime: DateTime, filename: Option[String], requestLoggingContext: RequestLoggingContext): Future[Result] = {
    val DigestedFile(tempFile_, id_) = digestedFile

    val uploadedBy_ = uploadedBy match {
      case Some(by) => by
      case None => Authentication.getIdentity(user)
    }

    // TODO: should error if the JSON parsing failed
    val identifiers_ = identifiers.map(Json.parse(_).as[Map[String, String]]) getOrElse Map()

    val uploadInfo_ = UploadInfo(filename.flatMap(_.trim.nonEmptyOpt))

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

  def storeFile(uploadRequest: UploadRequest, requestLoggingContext: RequestLoggingContext): Future[Result] = {
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

  // Find this a better home if used more widely
  implicit class NonEmpty(s: String) {
    def nonEmptyOpt: Option[String] = if (s.isEmpty) None else Some(s)
  }

}
