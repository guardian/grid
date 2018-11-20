package com.gu.mediaservice.lib.management

import com.gu.mediaservice.lib.argo.ArgoHelpers
import play.api.libs.json._
import play.api.mvc.{BaseController, ControllerComponents}

import scala.io.Source


class Management(override val controllerComponents: ControllerComponents) extends BaseController with ArgoHelpers {

  def healthCheck = Action {
    Ok("OK")
  }

  def disallowRobots = Action {
    Ok("User-agent: *\nDisallow: /\n")
  }

  lazy val stringManifest: Option[String] =
    for (stream <- Option(getClass.getResourceAsStream("/version.txt")))
    yield Source.fromInputStream(stream, "UTF-8").getLines.mkString("\n")

  lazy val jsonManifest: Option[JsValue] = stringManifest.map(manifestString => {
    Json.toJson(
      manifestString.split("\n")
        .flatMap(pair => pair.split(":", 2))
        .toList.map(_.trim)
        .grouped(2).collect { case List(k,v) => k -> v }
        .toMap[String, String]
    )
  })

  lazy val notFoundError = respondError(NotFound, "manifest-missing", "Manifest missing.")

  lazy val stringManifestResponse = stringManifest.fold(notFoundError)(Ok(_))
  lazy val jsonManifestResponse = jsonManifest.fold(notFoundError)(respond(_))

  def manifest = Action { implicit request =>
    request match {
      case Accepts.Html() => stringManifestResponse
      case Accepts.Json() => jsonManifestResponse
      case _ => stringManifestResponse
    }
  }
}
