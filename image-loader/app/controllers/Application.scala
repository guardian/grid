package controllers

import java.io.File
import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.Json
import play.api.Logger
import scala.concurrent.Future

import lib.play.BodyParsers.digestedFile
import lib.play.DigestedFile

import lib.{Config, Notifications}
import lib.storage.S3ImageStorage
import lib.imaging.{FileMetadata, MimeTypeDetection, Thumbnailer, ImageMetadata}
import lib.cleanup.MetadataCleaner

import model.{Asset, Image}

import com.gu.mediaservice.lib.{auth, ImageStorage}
import com.gu.mediaservice.lib.resource.FutureResources._
import com.gu.mediaservice.lib.auth.{AuthenticatedService, PandaUser, KeyStore}
import com.gu.mediaservice.lib.argo.ArgoHelpers


object Application extends ImageLoader(S3ImageStorage)

class ImageLoader(storage: ImageStorage) extends Controller with ArgoHelpers {

  val rootUri = Config.rootUri

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, rootUri)

  def index = Action {
    val response = Json.obj(
      "data"  -> Json.obj("description" -> "This is the Loader Service"),
      "links" -> Json.arr(
        Json.obj("rel" -> "load", "href" -> s"$rootUri/images{?uploadedBy,identifiers}")
      )
    )
    Ok(response).as(ArgoMediaType)
  }

  def loadImage(uploadedBy: Option[String], identifiers: Option[String]) = Authenticated.async(digestedFile(createTempFile)) { request =>
    val DigestedFile(tempFile, id) = request.body

    // only allow AuthenticatedService to set with query string
    val uploadedBy_ = (request.user, uploadedBy) match {
      case (user: AuthenticatedService, Some(qs)) => qs
      case (user: PandaUser, qs) => user.email
      case (user, qs) => user.name
    }

    val identifiers_ = identifiers map parseColonList getOrElse Map()

    Logger.info(s"Received file, id: $id, uploadedBy: $uploadedBy_")

    // Abort early if unsupported mime-type
    val mimeType = MimeTypeDetection.guessMimeType(tempFile)
    val future = if (Config.supportedMimeTypes.exists(Some(_) == mimeType)) {
      storeFile(id, tempFile, mimeType, uploadedBy_, identifiers_)
    } else {
      val mimeTypeName = mimeType getOrElse "none detected"
      Logger.info(s"Rejected file, id: $id, uploadedBy: $uploadedBy_, because the mime-type is not supported ($mimeTypeName). return 415")
      Future(UnsupportedMediaType(Json.obj("errorMessage" -> s"Unsupported mime-type: $mimeTypeName")))
    }

    future.onComplete(_ => tempFile.delete())
    future
  }

  def storeFile(id: String, tempFile: File, mimeType: Option[String], uploadedBy: String, identifiers: Map[String, String]): Future[Result] = {
    // Flatten identifiers to attach to S3 object
    val identifiersMeta = identifiers.map { case (k,v) => (s"identifier!$k", v) }.toMap

    // These futures are started outside the for-comprehension, otherwise they will not run in parallel
    val uriFuture = storage.storeImage(id, tempFile, mimeType, Map("uploaded_by" -> uploadedBy) ++ identifiersMeta)
    val thumbFuture = Thumbnailer.createThumbnail(Config.thumbWidth, tempFile.toString)
    val dimensionsFuture = FileMetadata.dimensions(tempFile)
    val fileMetadataFuture = FileMetadata.fromIPTCHeaders(tempFile)

    // TODO: better error handling on all futures. Similar to metadata
    bracket(thumbFuture)(_.delete) { thumb =>
      val result = for {
        uri        <- uriFuture
        dimensions <- dimensionsFuture
        fileMetadata <- fileMetadataFuture
        metadata    = ImageMetadata.fromFileMetadata(fileMetadata)
        cleanMetadata = MetadataCleaner.clean(metadata)
        sourceAsset = Asset(uri, tempFile.length, mimeType, dimensions)
        thumbUri   <- storage.storeThumbnail(id, thumb, mimeType)
        thumbSize   = thumb.length
        thumbDimensions <- FileMetadata.dimensions(thumb)
        thumbAsset  = Asset(thumbUri, thumbSize, mimeType, thumbDimensions)
        image       = Image.uploadedNow(id, uploadedBy, identifiers, sourceAsset, thumbAsset, fileMetadata, cleanMetadata)
      } yield {
        Notifications.publish(Json.toJson(image), "image")
        // TODO: return an entity pointing to the Media API uri for the image
        Accepted(Json.obj("id" -> id)).as(ArgoMediaType)
      }

      result recover {
        case e => {
          Logger.info(s"Rejected file, id: $id, uploadedBy: $uploadedBy, because: ${e.getMessage}. return 400")
          // TODO: Log when an image isn't deleted
          storage.deleteImage(id)
          // TODO: add errorCode
          BadRequest(Json.obj("errorMessage" -> e.getMessage))
        }
      }
    }
  }

  def createTempFile = File.createTempFile("requestBody", "", new File(Config.tempDir))


  def parseColonList(s: String): Map[String, String] = {
    def parseColonList0(l: List[String]): Map[String, String] = l match {
      case head :: tail => parseColonList0(tail) + parsePair(head)
      case Nil => Map()
    }

    def parsePair(p: String): (String, String) = p.split(":", 2).toList match {
      case k :: v :: Nil => k -> v
      case _ => throw new Error("Expected identifier to be of the form key:value")
    }

    val pairs = s.split(",", 2).toList
    parseColonList0(pairs)
  }
}
