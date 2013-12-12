package controllers

import java.net.URI
import scala.concurrent.Future

import play.api.data._, Forms._
import play.api.mvc.{Action, Controller}
import play.api.libs.json._
import play.api.libs.concurrent.Execution.Implicits._
import scalaz.syntax.id._

import lib.{Storage, Bounds, Crops}
import play.api.libs.ws.WS

object Application extends Controller {

  def index = Action {
    Ok("This is the Crop Service.\n")
  }

  val boundsForm =
    Form(tuple("source" -> nonEmptyText, "x" -> number, "y" -> number, "w" -> number, "h" -> number))

  def crop = Action.async { req =>

    boundsForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      {
        case (source, x, y, w, h) =>
          val actualSource = nonHttpsUri(new URI(source)).toURL.toExternalForm
          for {
            apiResp <- WS.url(actualSource).get
            SourceImage(id, file) = apiResp.json.as[SourceImage]
            cropFilename = s"$id/${x}_${y}_${w}_$h.jpg"
            file <- Crops.crop(new URI(file), Bounds(x, y, w, h))
            uri  <- Storage.store(cropFilename, file) <| (_.onComplete { case _ => file.delete })
          } yield Ok(cropUriResponse(uri))
      }
    )

  }

  def nonHttpsUri(uri: URI): URI =
    new URI("http", uri.getUserInfo, uri.getHost, uri.getPort, uri.getPath, uri.getQuery, uri.getFragment)

  def cropUriResponse(uri: URI): JsValue =
    Json.obj("uri" -> uri.toString)

}

case class SourceImage(id: String, file: String)

object SourceImage {
  import play.api.libs.functional.syntax._

  implicit val readsSourceImage: Reads[SourceImage] =
    ((__ \ "id").read[String] ~ (__ \ "secureUrl").read[String])(SourceImage.apply _)
}
