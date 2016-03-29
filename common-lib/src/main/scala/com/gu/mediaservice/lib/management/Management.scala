package com.gu.mediaservice.lib.management

import scala.io.Source

import play.api.libs.json._
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._

import play.api.mvc.{Action, Controller}


object Management extends Controller with ArgoHelpers {

  def healthCheck = Action {
    Ok("OK")
  }

  def manifestFromFile: Option[String] =
    for (stream <- Option(getClass.getResourceAsStream("/version.txt")))
    yield Source.fromInputStream(stream, "UTF-8").getLines.mkString("\n")


  lazy val manifest_ : Option[JsValue] = manifestFromFile.map(manifestString => {
    Json.toJson(
      manifestString.split("\n")
        .flatMap(pair => pair.split(":", 2))
        .toList.map(_.trim)
        .grouped(2).collect { case List(k,v) => k -> v }
        .toMap[String, String]
    )
  })

  def manifest = Action {
    manifest_.fold(
      respondError(NotFound, "manifest-missing", "Manifest missing.")
    )(respond(_))
  }

}
