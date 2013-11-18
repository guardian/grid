package com.gu.mediaservice.lib.management

import scala.io.Source
import play.api.mvc.{Action, Controller}


object Management extends Controller {

  def healthCheck = Action {
    Ok("OK")
  }

  lazy val manifest_ : Option[String] =
    for (stream <- Option(getClass.getResourceAsStream("/version.txt")))
    yield Source.fromInputStream(stream, "UTF-8").getLines.mkString("\n")

  def manifest = Action {
    manifest_.fold(NotFound("Manifest missing."))(Ok(_))
  }

}
