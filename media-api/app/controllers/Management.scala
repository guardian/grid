package controllers

import java.io.{FileNotFoundException, File}
import scala.io.Source
import play.api.mvc.{Action, Controller}


object Management extends Controller {

  def healthCheck = Action {
    Ok("OK")
  }

  lazy val manifest_ : Option[String] =
    try {
      val file = new File(getClass.getResource("/version.txt").toURI)
      Some(Source.fromFile(file).mkString)
    }
    catch {
      case _: FileNotFoundException => None
    }

  def manifest = Action {
    manifest_.fold(NotFound("Manifest missing."))(Ok(_))
  }

}
