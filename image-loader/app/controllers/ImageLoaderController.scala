package controllers

import java.io.File
import java.net.URI

import com.gu.mediaservice.lib.{DateTimeUtils, ImageIngestOperations}
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.logging.{FALLBACK, RequestLoggingContext}
import lib._
import lib.imaging.{Importer, Projecter}
import lib.storage.ImageLoaderStore
import model.{ImageUploadOps, ImageUploadProjector}
import play.api.Logger
import play.api.libs.json.Json
import play.api.libs.ws.WSClient
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.control.NonFatal
import scala.util.{Failure, Success, Try}

class ImageLoaderController(auth: Authentication, downloader: Downloader, store: ImageLoaderStore, notifications: Notifications,
                            config: ImageLoaderConfig, imageUploadOps: ImageUploadOps, imageUploadProjector: ImageUploadProjector,
                            override val controllerComponents: ControllerComponents, wSClient: WSClient)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  private val imageProjecter = new Projecter(config)
  private val imageImporter = new Importer(config, imageUploadOps, notifications, store)

  val indexResponse: Result = {
    val indexData = Map("description" -> "This is the Loader Service")
    val indexLinks = List(
      Link("load", s"${config.rootUri}/images{?uploadedBy,identifiers,uploadTime,filename}"),
      Link("import", s"${config.rootUri}/imports{?uri,uploadedBy,identifiers,uploadTime,filename}")
    )
    respond(indexData, indexLinks)
  }

  def index: Action[AnyContent] = auth { indexResponse }

  def loadImage(uploadedBy: Option[String], identifiers: Option[String], uploadTime: Option[String], filename: Option[String]): Action[DigestedFile] = {
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

    val tempFile = createTempFile("requestBody", requestContext)
    val parsedBody = DigestBodyParser.create(tempFile)
    Logger.info("body parsed")(requestContext.toMarker(markers))

    auth.async(parsedBody) { req =>
      val result = imageImporter.loadFile(req.body, req.user, uploadedBy, identifiers, DateTimeUtils.fromValueOrNow(uploadTime), filename.flatMap(_.trim.nonEmptyOpt), requestContext)
      Logger.info("loadImage request end")(requestContext.toMarker(markers))
      result.onComplete(_ => tempFile.delete())
      result
    }
  }

  def projectImageBy(imageId: String): Action[AnyContent] = {
    val requestContext = RequestLoggingContext(
      initialMarkers = Map(
        "imageId" -> imageId,
        "requestType" -> "image-projection"
      )
    )

    auth { _ =>
      val tempFile = createTempFile(s"projection-$imageId", requestContext)
      imageProjecter.projectS3ImageById(imageUploadProjector, imageId, requestContext, tempFile) match {
        case Success(maybeImage) =>
          maybeImage match {
            case Some(img) =>
              Logger.info("image found")(requestContext.toMarker())
              tempFile.delete()
              Ok(Json.toJson(img)).as(ArgoMediaType)
            case None =>
              val s3Path = "s3://" + config.imageBucket + "/" + ImageIngestOperations.fileKeyFromId(imageId)
              Logger.info("image not found")(requestContext.toMarker())
              tempFile.delete()
              respondError(NotFound, "image-not-found", s"Could not find image: $imageId in s3 at $s3Path")
          }
        case Failure(error) =>
          Logger.error(s"image projection failed", error)(requestContext.toMarker())
          tempFile.delete()
          respondError(InternalServerError, "image-projection-failed", error.getMessage)
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
        val tempFile = createTempFile("download", requestContext)

        val result = downloader.download(validUri, tempFile).flatMap { digestedFile =>
          imageImporter.loadFile(digestedFile, request.user, uploadedBy, identifiers, DateTimeUtils.fromValueOrNow(uploadTime), filename.flatMap(_.trim.nonEmptyOpt), requestContext)
        } recover {
          case NonFatal(e) =>
            Logger.error(s"Unable to download image $uri", e)
            // Need to delete this here as a failure response will never have its onComplete method called.
            tempFile.delete()
            FailureResponse.failedUriDownload
        }

        result onComplete (_ => tempFile.delete())
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


  // Find this a better home if used more widely
  implicit class NonEmpty(s: String) {
    def nonEmptyOpt: Option[String] = if (s.isEmpty) None else Some(s)
  }

  // To avoid Future _madness_, it is better to make tempfiles at the controller and pass them down,
  // then clear them up again at the end.
  def createTempFile(prefix: String, requestContext: RequestLoggingContext): File = {
    Logger.info(s"creating temp file in ${config.tempDir}")(requestContext.toMarker())
    File.createTempFile(prefix, "", config.tempDir)
  }


}
