package controllers

import java.io.File
import play.api.mvc._

import lib.imaging.ImageMetadata
import lib.storage.DevNullStorage
import lib.{Config, SNS}

import play.api.libs.json.Json


object Application extends Controller {

  val storage = DevNullStorage

  def index = Action {
    Ok("This is the Image Loader API.\r\n")
  }

  def putImage(id: String) = Action(parse.file(createTempFile)) { request =>
    val tempFile = request.body

    val meta = ImageMetadata.iptc(tempFile)
    val uri = storage.store(tempFile)
    val image = model.Image(id, uri, meta)

    SNS.publish(Json.stringify(Json.toJson(image)), Some("image"))

    tempFile.delete()
    NoContent
  }

  def createTempFile = File.createTempFile("requestBody", "", new File(Config.tempUploadDir))

}
