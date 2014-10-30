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
import com.gu.mediaservice.lib.auth.KeyStore

object Application extends ImageLoader(S3ImageStorage)

class ImageLoader(storage: ImageStorage) extends Controller {

  val rootUri = Config.rootUri

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, rootUri)

  def index = Action {
    val response = Json.obj(
      "data"  -> Json.obj("description" -> "This is the Loader Service"),
      "links" -> Json.arr(
        Json.obj("rel" -> "load", "href" -> s"$rootUri/images")
      )
    )
    Ok(response)
  }

  def loadImage = Authenticated.async(digestedFile(createTempFile)) { request =>
    val DigestedFile(tempFile, id) = request.body
    Logger.info(s"Received file, id: $id")

    val uploadedBy = request.getQueryString("uploadedBy")

    // These futures are started outside the for-comprehension, otherwise they will not run in parallel
    val uriFuture = storage.storeImage(id, tempFile, uploadedBy.map(s => ("uploaded_by", s)).toMap)
    val thumbFuture = Thumbnailer.createThumbnail(Config.thumbWidth, tempFile.toString)
    val dimensionsFuture = FileMetadata.dimensions(tempFile)
    val metadataFuture = ImageMetadata.fromIPTCHeaders(tempFile)
    val fileMetadataFuture = FileMetadata.fromIPTCHeaders(tempFile)
    // TODO: derive ImageMetadata from FileMetadata

    val future = bracket(thumbFuture)(_.delete) { thumb =>
      for {
        uri        <- uriFuture
        dimensions <- dimensionsFuture
        // TODO: fail with error if missing metadata
        metadata   <- metadataFuture
        fileMetadata <- fileMetadataFuture
        // TODO: validate mime-type against white-list
        mimeType    = MimeTypeDetection.guessMimeType(tempFile)
        sourceAsset = Asset(uri, tempFile.length, mimeType, dimensions)
        thumbUri   <- storage.storeThumbnail(id, thumb)
        thumbSize   = thumb.length
        thumbDimensions <- FileMetadata.dimensions(thumb)
        thumbAsset  = Asset(thumbUri, thumbSize, mimeType, thumbDimensions)
        image       = Image.uploadedNow(id, uploadedBy, sourceAsset, thumbAsset, fileMetadata, metadata, false)
      } yield {
        Notifications.publish(Json.toJson(image), "image")
        Accepted(Json.obj("id" -> id))
      }
    }
    future.onComplete(_ => tempFile.delete())
    future
  }

  def createTempFile = File.createTempFile("requestBody", "", new File(Config.tempDir))

}
