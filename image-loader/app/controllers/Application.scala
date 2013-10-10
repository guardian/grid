package controllers

import java.io.File
import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.Json
import play.api.Logger

import lib.imaging.ImageMetadata
import lib.play.BodyParsers.digestedFile
import lib.play.MD5DigestedFile
import lib.storage.S3Storage
import lib.{Config, SNS}
import model.Image


object Application extends Controller {

  val storage = S3Storage

  def index = Action {
    Ok("This is the Image Loader API.\n")
  }

  def loadImage = Action(digestedFile(createTempFile)) { request =>
    val MD5DigestedFile(tempFile, id) = request.body
    Logger.info(s"Received file, id: $id")

    val meta = ImageMetadata.iptc(tempFile)
    val uri = storage.store(id, tempFile)
    val image = Image.uploadedNow(id, uri, meta)

    SNS.publish(Json.stringify(Json.toJson(image)), Some("image"))

    tempFile.delete()

    Accepted(Json.obj("id" -> id))
  }

  def createTempFile = File.createTempFile("requestBody", "", new File(Config.tempUploadDir))

}
