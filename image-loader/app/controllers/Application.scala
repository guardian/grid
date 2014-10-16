package controllers

import java.io.File
import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.Json
import play.api.Logger

import lib.imaging.{MimeTypeDetection, Thumbnailer, ImageMetadata}
import lib.play.BodyParsers.digestedFile
import lib.play.DigestedFile

import lib.{Config, Notifications}
import model.{Asset, Image}
import lib.storage.S3ImageStorage
import com.gu.mediaservice.lib.ImageStorage
import com.gu.mediaservice.lib.resource.FutureResources._

object Application extends ImageLoader(S3ImageStorage)

class ImageLoader(storage: ImageStorage) extends Controller {

  def index = Action {
    Ok("This is the Image Loader API.\n")
  }

  def loadImage = Action.async(digestedFile(createTempFile)) { request =>
    val DigestedFile(tempFile, id) = request.body
    Logger.info(s"Received file, id: $id")

    val uploadedBy = request.getQueryString("uploadedBy")

    // These futures are started outside the for-comprehension, otherwise they will not run in parallel
    val uriFuture = storage.storeImage(id, tempFile, uploadedBy.map(s => ("uploaded_by", s)).toMap)
    val thumbFuture = Thumbnailer.createThumbnail(Config.thumbWidth, tempFile.toString)
    val dimensionsFuture = ImageMetadata.dimensions(tempFile)
    val metadataFuture = ImageMetadata.fromIPTCHeaders(tempFile)

    val future = bracket(thumbFuture)(_.delete) { thumb =>
      for {
        uri        <- uriFuture
        dimensions <- dimensionsFuture
        metadata   <- metadataFuture
        mimeType    = MimeTypeDetection.guessMimeType(tempFile)
        sourceAsset = Asset(uri, tempFile.length, mimeType, dimensions)
        thumbUri   <- storage.storeThumbnail(id, thumb)
        thumbSize   = thumb.length
        thumbDimensions <- ImageMetadata.dimensions(thumb)
        thumbAsset  = Asset(thumbUri, thumbSize, mimeType, thumbDimensions)
        image       = Image.uploadedNow(id, uri, uploadedBy, sourceAsset, thumbAsset, metadata, dimensions)
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
