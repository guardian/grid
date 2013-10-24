package com.gu.mediaservice.lib.json

import scala.PartialFunction.condOpt

import play.api.libs.json._
import play.api.Logger
import play.api.libs.json.JsString


trait PlayJsonHelpers {

  def logParseErrors(parseResult: JsResult[_]): Unit =
    parseResult.fold(
      _ map { case (path, errors) =>
        Logger.error(s"Validation errors at $path: [${errors.map(_.message).mkString(", ")}]")
      },
      _ => ())

  def string(v: JsValue): Option[String] =
    condOpt(v) { case JsString(s) => s }

  def array(v: JsValue): Option[List[JsValue]] =
    condOpt(v) { case JsArray(vs) => vs.toList }

}

object PlayJsonHelpers extends PlayJsonHelpers
