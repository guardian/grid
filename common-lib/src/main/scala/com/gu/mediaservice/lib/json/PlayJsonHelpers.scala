package com.gu.mediaservice.lib.json

import play.api.libs.json.{JsResult, JsPath}
import play.api.data.validation.ValidationError
import play.api.Logger


object PlayJsonHelpers {

  def logParseErrors(parseResult: JsResult[_]): Unit =
    parseResult.fold(
      _ map { case (path, errors) =>
        Logger.error(s"Validation errors at $path: [${errors.map(_.message).mkString(", ")}]")
      },
      _ => ())

}
