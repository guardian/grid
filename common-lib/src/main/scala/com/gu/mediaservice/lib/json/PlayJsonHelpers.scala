package com.gu.mediaservice.lib.json

import com.gu.mediaservice.lib.logging.GridLogging
import com.typesafe.scalalogging.Logger

import scala.PartialFunction.condOpt
import play.api.libs.json._
import play.api.libs.json.JsString


trait PlayJsonHelpers {

  protected def logger: Logger

  def logParseErrors(parseResult: JsResult[_]): Unit =
    parseResult.fold(
      _ map { case (path, errors) =>
        logger.error(s"Validation errors at $path: [${errors.map(_.message).mkString(", ")}]")
      },
      _ => ())

  def string(v: JsValue): Option[String] =
    condOpt(v) { case JsString(s) => s }

  def array(v: JsValue): Option[List[JsValue]] =
    condOpt(v) { case JsArray(vs) => vs.toList }

}

object PlayJsonHelpers extends PlayJsonHelpers with GridLogging
