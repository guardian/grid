package controllers

import java.io.File
import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.Json
import play.api.Logger

import lib.imaging.ImageMetadata
import lib.play.BodyParsers.digestedFile
import lib.play.MD5DigestedFile
import lib.storage.{StorageBackend, S3Storage}
import lib.{Config, Notifications}
import model.Image


object Application extends ImageLoader(S3Storage)

class ImageLoader(storage: StorageBackend) extends Controller {

  def index = Action {
    Ok("This is the Image Loader API.\n")
  }

  def loadImage = Action(digestedFile(createTempFile)) { request =>
    val MD5DigestedFile(tempFile, id) = request.body
    Logger.info(s"Received file, id: $id")

    val meta = ImageMetadata.iptc(tempFile)
    val uri = storage.store(id, tempFile)
    val image = Image.uploadedNow(id, uri, meta)

    Notifications.publish(Json.toJson(image), "image")

    tempFile.delete()

    Accepted(Json.obj("id" -> id))
  }

  def createTempFile = File.createTempFile("requestBody", "", new File(Config.tempUploadDir))

}
