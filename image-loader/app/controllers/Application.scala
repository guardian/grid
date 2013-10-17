package controllers

import java.io.File
import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.Json
import play.api.Logger

import lib.imaging.{Thumbnailer, ImageMetadata}
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

  val thumbWidth = 256

  def loadImage = Action.async(digestedFile(createTempFile)) { request =>
    val MD5DigestedFile(tempFile, id) = request.body
    Logger.info(s"Received file, id: $id")

    val meta = ImageMetadata.iptc(tempFile)

    // These futures are started outside the for-comprehension, otherwise they will not run in parallel
    // (the consequence of using a monad when an applicative will do)
    val storedImage = storage.storeImage(id, tempFile)
    val thumbFile = Thumbnailer.createThumbnail(thumbWidth, tempFile.toString)

    for {
      uri      <- storedImage
      thumb    <- thumbFile
      thumbUri <- storage.storeThumbnail(id, thumb)
    } yield {
      val image = Image.uploadedNow(id, uri, Thumbnail(thumbUri), meta)
      // TODO notifications and file deletion should probably be done asynchronously too
      Notifications.publish(Json.toJson(image), "image")
      tempFile.delete()
      Accepted(Json.obj("id" -> id))
    }
  }

  def thumbId(id: String): String = s"$id-thumb"

  def createTempFile = File.createTempFile("requestBody", "", new File(Config.tempDir))

}
