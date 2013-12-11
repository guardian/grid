package com.gu.mediaservice.syntax

import java.net.{URISyntaxException, URI}
import play.api.mvc.RequestHeader
import scalaz.{Failure, Success, ValidationNel}
import scalaz.syntax.std.option._
import scalaz.syntax.nel._


trait RequestHeaderSyntax {

  implicit class RequestHeaderOps(self: RequestHeader) {

    def forwardedProtocol: Option[String] =
      self.headers.get("X-Forwarded-Proto")

    def queryParam[A](k: String)(implicit A: ParamReads[A]): ValidationNel[String, A] =
      self.getQueryString(k).toSuccess(s"missing query parameter: $k".wrapNel).flatMap(A.read(_, k))
  }

}

trait ParamReads[A] {
  def read(s: String, key: String): ValidationNel[String, A]
}

object ParamReads {

  implicit val stringParamReads: ParamReads[String] = new ParamReads[String] {
    def read(s: String, key: String) = Success(s)
  }

  implicit val intParamReads: ParamReads[Int] = new ParamReads[Int] {
    def read(s: String, key: String) =
      try Success(s.toInt)
      catch {
        case e: NumberFormatException => Failure(s"invalid integer $key".wrapNel)
      }
  }

  implicit val uriParamReads: ParamReads[URI] = new ParamReads[URI] {
    def read(s: String, key: String) =
      try Success(new URI(s))
      catch {
        case e: URISyntaxException => Failure(s"invalid uri $key".wrapNel)
      }
  }

}

object RequestHeaderSyntax extends RequestHeaderSyntax
