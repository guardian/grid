package controllers

import java.io.File
import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.Json
import play.api.Logger

import lib.imaging.{Thumbnailer, IptcMetadata}
import lib.play.BodyParsers.digestedFile
import lib.play.MD5DigestedFile
import lib.storage.{StorageBackend, S3Storage}
import lib.{Config, Notifications}
import model.{Thumbnail, Image}


object Application extends ImageLoader(S3Storage)

class ImageLoader(storage: StorageBackend) extends Controller {

  def index = Action {
    Ok("This is the Image Loader API.\n")
  }

  def loadImage = Action.async(digestedFile(createTempFile)) { request =>
    val MD5DigestedFile(tempFile, id) = request.body
    Logger.info(s"Received file, id: $id")

    val uploadedBy = request.getQueryString("uploadedBy")
    val meta = IptcMetadata.fromFile(tempFile)
    val dimensions = IptcMetadata.dimensions(tempFile)

    // These futures are started outside the for-comprehension, otherwise they will not run in parallel
    val storedImage = storage.storeImage(id, tempFile, uploadedBy.map(s => ("uploaded_by", s)).toMap)
    val thumbFile = Thumbnailer.createThumbnail(Config.thumbWidth, tempFile.toString)

    for {
      url      <- storedImage
      thumb    <- thumbFile
      thumbUrl <- storage.storeThumbnail(id, thumb)
    } yield {
      val thumbDimensions = IptcMetadata.dimensions(thumb)
      val image = Image.uploadedNow(id, url.toURI, uploadedBy, Thumbnail(thumbUrl.toURI, thumbDimensions), meta,
                                    dimensions)
      // TODO notifications and file deletion should probably be done asynchronously too
      Notifications.publish(Json.toJson(image), "image")
      tempFile.delete()
      thumb.delete()
      Accepted(Json.obj("id" -> id))
    }
  }

  def thumbId(id: String): String = s"$id-thumb"

  def createTempFile = File.createTempFile("requestBody", "", new File(Config.tempDir))

}
