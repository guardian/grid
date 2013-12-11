package controllers

import java.net.URI
import scala.concurrent.Future

import play.api.mvc.{Action, Controller}
import play.api.libs.concurrent.Execution.Implicits._
import scalaz.syntax.all._
import scalaz.std.list._
import scalaz.{Failure, Success}
import com.gu.mediaservice.syntax._
import lib.{Storage, Bounds, Crops}

object Application extends Controller {

  def index = Action {
    Ok("This is the Crop Service.\n")
  }

  def crop = Action.async { req =>

    val cropFile =
      ( req.queryParam[URI]("source")
    |@| req.queryParam[Int]("x")
    |@| req.queryParam[Int]("y")
    |@| req.queryParam[Int]("w")
    |@| req.queryParam[Int]("h")
      ) {
        (source, x, y, width, height) =>
          Crops.crop(source, Bounds(x, y, width, height))
            .flatMap(file => Storage.store("foo", file) <| (_.onComplete { case _ => file.delete() }))
      }

    cropFile match {
      case Success(cropUri) =>
        cropUri map (f => Ok(s"Saved crop to file: $f"))
      case Failure(errors) =>
        Future.successful(BadRequest("Bad request: " + errors.toList.mkString(", ")))
    }

  }

}
