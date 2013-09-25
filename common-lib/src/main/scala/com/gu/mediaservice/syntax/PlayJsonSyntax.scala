package com.gu.mediaservice.syntax

import play.api.libs.json.JsResult
import com.gu.mediaservice.lib.json.PlayJsonHelpers

trait PlayJsonSyntax {

  implicit class JsResultOps[A](self: JsResult[A]) {
    def logParseErrors(): Unit = PlayJsonHelpers.logParseErrors(self)
  }

}

object PlayJsonSyntax extends PlayJsonSyntax
