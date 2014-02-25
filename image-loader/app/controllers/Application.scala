package controllers

import java.io.File
import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.Json
import play.api.Logger

import lib.imaging.{Thumbnailer, ImageMetadata}
import lib.play.BodyParsers.digestedFile
import lib.play.MD5DigestedFile

import lib.{Config, Notifications}
import model.{Thumbnail, Image}
import lib.storage.S3ImageStorage
import com.gu.mediaservice.lib.ImageStorage

object Application extends ImageLoader(S3ImageStorage)

class ImageLoader(storage: ImageStorage) extends Controller {

  def index = Action {
    Ok("This is the Image Loader API.\n")
  }

  def loadImage = Action.async(digestedFile(createTempFile)) { request =>
    val MD5DigestedFile(tempFile, id) = request.body
    Logger.info(s"Received file, id: $id")

    val uploadedBy = request.getQueryString("uploadedBy")

    // These futures are started outside the for-comprehension, otherwise they will not run in parallel
    val uriFuture = storage.storeImage(id, tempFile, uploadedBy.map(s => ("uploaded_by", s)).toMap)
    val thumbFuture = Thumbnailer.createThumbnail(Config.thumbWidth, tempFile.toString)
    val dimensionsFuture = ImageMetadata.dimensions(tempFile)
    val metadataFuture = ImageMetadata.fromIPTCHeaders(tempFile)

    val future = for {
      thumb      <- thumbFuture
    } yield {
      val future = for {
        uri        <- uriFuture
        dimensions <- dimensionsFuture
        metadata   <- metadataFuture
        thumbUri   <- storage.storeThumbnail(id, thumb)
        thumbDimensions <- ImageMetadata.dimensions(thumb)
        image = Image.uploadedNow(id, uri, uploadedBy, Thumbnail(thumbUri, thumbDimensions), metadata, dimensions)
      } yield {
        Notifications.publish(Json.toJson(image), "image")
        thumb.delete()
        Accepted(Json.obj("id" -> id))
      }
      future.onComplete(_ => thumb.delete())
      future
    }
    future.onComplete(_ => tempFile.delete())
    future.flatMap(identity)
  }

  def thumbId(id: String): String = s"$id-thumb"

  def createTempFile = File.createTempFile("requestBody", "", new File(Config.tempDir))

}
