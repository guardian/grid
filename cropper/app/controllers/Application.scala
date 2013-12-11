package controllers

import java.net.URI
import scala.concurrent.Future

import play.api.data._, Forms._
import play.api.mvc.{Action, Controller}
import play.api.libs.json.{Json, JsValue}
import play.api.libs.concurrent.Execution.Implicits._
import scalaz.syntax.id._

import lib.{Storage, Bounds, Crops}

object Application extends Controller {

  def index = Action {
    Ok("This is the Crop Service.\n")
  }

  val boundsForm =
    Form(tuple("source" -> nonEmptyText, "x" -> number, "y" -> number, "w" -> number, "h" -> number))

  def crop = Action.async { req =>

    boundsForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      { case (source, x, y, width, height) =>
        for {
          file <- Crops.crop(new URI(source), Bounds(x, y, width, height))
          uri  <- Storage.store("foo", file) <| (_.onComplete { case _ => file.delete })
        } yield Ok(cropUriResponse(uri))
      }
    )

  }


  def cropUriResponse(uri: URI): JsValue =
    Json.obj("uri" -> uri.toString)

}
