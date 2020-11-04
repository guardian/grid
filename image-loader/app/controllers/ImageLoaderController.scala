package controllers

import java.io.File
import java.net.URI

import com.drew.imaging.ImageProcessingException
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.logging.{FALLBACK, GridLogging, LogMarker, RequestLoggingContext}
import com.gu.mediaservice.lib.{DateTimeUtils, ImageIngestOperations}
import com.gu.mediaservice.model.UnsupportedMimeTypeException
import lib._
import lib.imaging.{NoSuchImageExistsInS3, UserImageLoaderException}
import lib.storage.ImageLoaderStore
import model.{Projector, Uploader}
import play.api.libs.json.Json
import play.api.libs.ws.WSClient
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try
import scala.util.control.NonFatal

class ImageLoaderController(auth: Authentication,
                            downloader: Downloader,
                            store: ImageLoaderStore,
                            notifications: Notifications,
                            config: ImageLoaderConfig,
                            uploader: Uploader,
                            projector: Projector,
                            override val controllerComponents: ControllerComponents,
                            wSClient: WSClient)
                           (implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  private lazy val indexResponse: Result = {
    val indexData = Map("description" -> "This is the Loader Service")
    val indexLinks = List(
      Link("load", s"${config.rootUri}/images{?uploadedBy,identifiers,uploadTime,filename}"),
      Link("import", s"${config.rootUri}/imports{?uri,uploadedBy,identifiers,uploadTime,filename}")
    )
    respond(indexData, indexLinks)
  }

  def index: Action[AnyContent] = auth { indexResponse }

  def loadImage(uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String], filename: Option[String]): Action[DigestedFile] = {
    implicit val context: RequestLoggingContext = RequestLoggingContext(
      initialMarkers = Map(
        "requestType" -> "load-image",
        "uploadedBy" -> uploadedBy.getOrElse(FALLBACK),
        "identifiers" -> identifiers.getOrElse(FALLBACK),
        "uploadTime" -> uploadTime.getOrElse(FALLBACK),
        "filename" -> filename.getOrElse(FALLBACK)
      )
    )
    logger.info("loadImage request start")

    // synchronous write to file
    val tempFile = createTempFile("requestBody")
    logger.info("body parsed")
    val parsedBody = DigestBodyParser.create(tempFile)

    auth.async(parsedBody) { req =>
      val result = for {
        uploadRequest <- uploader.loadFile(
          req.body,
          req.user,
          uploadedBy,
          identifiers,
          DateTimeUtils.fromValueOrNow(uploadTime),
          filename.flatMap(_.trim.nonEmptyOpt),
          context.requestId)
        result <- uploader.storeFile(uploadRequest)
      } yield result

      result.onComplete( _ => Try { deleteTempFile(tempFile) } )

      result map { r =>
        val result = Accepted(r).as(ArgoMediaType)
        logger.info("loadImage request end")
        result
      } recover {
        case e =>
          logger.error("loadImage request ended with a failure", e)
          (e match {
            case e: UnsupportedMimeTypeException => FailureResponse.unsupportedMimeType(e, config.supportedMimeTypes)
            case e: ImageProcessingException => FailureResponse.notAnImage(e, config.supportedMimeTypes).as(ArgoMediaType)
            case e: java.io.IOException => FailureResponse.badImage(e).as(ArgoMediaType)
            case e =>
              logger.error("Failed upload", e)
              InternalServerError(Json.obj("error" -> e.getMessage)).as(ArgoMediaType)
          }).as(ArgoMediaType)
      }
    }
  }

  // Fetch
  def projectImageBy(imageId: String): Action[AnyContent] = {
    implicit val context: RequestLoggingContext = RequestLoggingContext(
      initialMarkers = Map(
        "imageId" -> imageId,
        "requestType" -> "image-projection"
      )
    )
    val tempFile = createTempFile(s"projection-$imageId")
    auth.async { _ =>
      val result= projector.projectS3ImageById(projector, imageId, tempFile, context.requestId)

      result.onComplete( _ => Try { deleteTempFile(tempFile) } )

      result.map {
        case Some(img) =>
          logger.info("image found")
          Ok(Json.toJson(img)).as(ArgoMediaType)
        case None =>
          val s3Path = "s3://" + config.imageBucket + "/" + ImageIngestOperations.fileKeyFromId(imageId)
          logger.info("image not found")
          respondError(NotFound, "image-not-found", s"Could not find image: $imageId in s3 at $s3Path")
      } recover {
        case _: NoSuchImageExistsInS3 => NotFound(Json.obj("imageId" -> imageId))
        case _ => InternalServerError(Json.obj("imageId" -> imageId))
      }

    }
  }

  def importImage(
                   uri: String,
                   uploadedBy: Option[String],
                   identifiers: Option[String],
                   uploadTime: Option[String],
                   filename: Option[String]
                 ): Action[AnyContent] = {
    auth.async { request =>
      implicit val context: RequestLoggingContext = RequestLoggingContext(
        initialMarkers = Map(
          "requestType" -> "import-image",
          "key-tier" -> request.user.accessor.tier.toString,
          "key-name" -> request.user.accessor.identity
        )
      )

      logger.info("importImage request start")

      val tempFile = createTempFile("download")
      val result = for {
        validUri <- Future { URI.create(uri) }
        digestedFile <- downloader.download(validUri, tempFile)
        uploadRequest <- uploader.loadFile(
          digestedFile,
          request.user,
          uploadedBy,
          identifiers,
          DateTimeUtils.fromValueOrNow(uploadTime),
          filename.flatMap(_.trim.nonEmptyOpt),
          context.requestId)
        result <- uploader.storeFile(uploadRequest)
      } yield result

      result.onComplete( _ => Try { deleteTempFile(tempFile) } )

      result
        .map {
          r => {
            logger.info("importImage request end")
            // NB This return code (202) is explicitly required by s3-watcher
            // Anything else (eg 200) will be logged as an error. DAMHIKIJKOK.
            Accepted(r).as(ArgoMediaType)
          }
        }
        .recover {
          case e: UnsupportedMimeTypeException => FailureResponse.unsupportedMimeType(e, config.supportedMimeTypes)
          case _: IllegalArgumentException => FailureResponse.invalidUri
          case e: UserImageLoaderException => FailureResponse.badUserInput(e)
          case NonFatal(_) => FailureResponse.failedUriDownload
      }
    }
  }

  // Find this a better home if used more widely
  implicit class NonEmpty(s: String) {
    def nonEmptyOpt: Option[String] = if (s.isEmpty) None else Some(s)
  }

  // To avoid Future _madness_, it is better to make temp files at the controller and pass them down,
  // then clear them up again at the end.  This avoids leaks.
  def createTempFile(prefix: String)(implicit logMarker: LogMarker): File = {
    val tempFile = File.createTempFile(prefix, "", config.tempDir)
    logger.info(s"Created temp file ${tempFile.getName} in ${config.tempDir}")
    tempFile
  }

  def deleteTempFile(tempFile: File)(implicit logMarker: LogMarker): Future[Unit] = Future {
    if (tempFile.delete()) {
      logger.info(s"Deleted temp file $tempFile")
    } else {
      logger.warn(s"Unable to delete temp file $tempFile in ${config.tempDir}")
    }
  }

}
