package com.gu.mediaservice.syntax

import play.api.mvc.RequestHeader

trait RequestHeaderSyntax {

  implicit class RequestHeaderOps(self: RequestHeader) {
    def forwardedProtocol: Option[String] =
      self.headers.get("X-Forwarded-Proto")
  }

}

object RequestHeaderSyntax extends RequestHeaderSyntax
