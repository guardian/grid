package controllers

import java.io.File
import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.Json
import play.api.Logger

import lib.play.BodyParsers.digestedFile
import lib.play.DigestedFile

import lib.{Config, Notifications}
import lib.storage.S3ImageStorage
import lib.imaging.{FileMetadata, MimeTypeDetection, Thumbnailer, ImageMetadata}

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
        Json.obj("rel" -> "load", "href" -> s"$rootUri/images{?uploadedBy}")
      )
    )
    Ok(response).as(ArgoMediaType)
  }

  def loadImage = Authenticated.async(digestedFile(createTempFile)) { request =>
    val DigestedFile(tempFile, id) = request.body
    Logger.info(s"Received file, id: $id")

    // only allow AuthenticatedService to set with query string
    val uploadedBy = (request.user, request.getQueryString("uploadedBy")) match {
      case (user: AuthenticatedService, Some(qs)) => qs
      case (user: PandaUser, qs) => user.email
      case (user, qs) => user.name
    }

    // These futures are started outside the for-comprehension, otherwise they will not run in parallel
    val mimeType = MimeTypeDetection.guessMimeType(tempFile)
    // TODO: validate mime-type against white-list
    val uriFuture = storage.storeImage(id, tempFile, mimeType, Map("uploaded_by" -> uploadedBy))
    val thumbFuture = Thumbnailer.createThumbnail(Config.thumbWidth, tempFile.toString)
    val dimensionsFuture = FileMetadata.dimensions(tempFile)
    val metadataFuture = ImageMetadata.fromIPTCHeaders(tempFile)
    val fileMetadataFuture = FileMetadata.fromIPTCHeaders(tempFile)
    // TODO: derive ImageMetadata from FileMetadata

    // TODO: better error handling on all futures. Similar to metadata
    val future = bracket(thumbFuture)(_.delete) { thumb =>
      val result = for {
        uri        <- uriFuture
        dimensions <- dimensionsFuture
        metadata   <- metadataFuture
        fileMetadata <- fileMetadataFuture
        sourceAsset = Asset(uri, tempFile.length, mimeType, dimensions)
        thumbUri   <- storage.storeThumbnail(id, thumb, mimeType)
        thumbSize   = thumb.length
        thumbDimensions <- FileMetadata.dimensions(thumb)
        thumbAsset  = Asset(thumbUri, thumbSize, mimeType, thumbDimensions)
        image       = Image.uploadedNow(id, uploadedBy, sourceAsset, thumbAsset, fileMetadata, metadata, false)
      } yield {
        Notifications.publish(Json.toJson(image), "image")
        // TODO: return an entity pointing to the Media API uri for the image
        Accepted(Json.obj("id" -> id)).as(ArgoMediaType)
      }

      result recover {
        case e => {
          Logger.info(s"Rejected file, id: $id, because: ${e.getMessage}. return 400")
          // TODO: Log when an image isn't deleted
          storage.deleteImage(id)
          // TODO: add errorCode
          BadRequest(Json.obj("errorMessage" -> e.getMessage))
        }
      }
    }

    future.onComplete(_ => tempFile.delete())
    future
  }

  def createTempFile = File.createTempFile("requestBody", "", new File(Config.tempDir))
}
