package controllers

import java.io.File
import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.Json
import play.api.Logger

import lib.imaging.ImageMetadata
import lib.play.BodyParsers.digestedFile
import lib.storage.DevNullStorage
import lib.{Config, SNS}


object Application extends Controller {

  val storage = DevNullStorage

  def index = Action {
    Ok("This is the Image Loader API.\r\n")
  }

  def putImage(id: String) = Action(digestedFile(createTempFile)) { request =>
    val tempFile = request.body.file
    Logger.info(s"Received file, md5: ${request.body.digestAsBase32}")

    val meta = ImageMetadata.iptc(tempFile)
    val uri = storage.store(tempFile)
    val image = model.Image(id, uri, meta)

    SNS.publish(Json.stringify(Json.toJson(image)), Some("image"))

    tempFile.delete()
    NoContent
  }

  def createTempFile = File.createTempFile("requestBody", "", new File(Config.tempUploadDir))

}
