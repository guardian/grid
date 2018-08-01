package com.gu.mediaservice.syntax

import java.net.URI

import play.api.libs.json._
import com.gu.mediaservice.lib.json.PlayJsonHelpers

import scala.util.{Failure, Success, Try}

trait PlayJsonSyntax {

  implicit class JsResultOps[A](self: JsResult[A]) {
    def logParseErrors(): Unit = PlayJsonHelpers.logParseErrors(self)
  }

  implicit val uriWrites = new Writes[URI] {
    override def writes(o: URI): JsValue = JsString(o.toString)
  }

  implicit val uriReads = new Reads[URI] {
    override def reads(json: JsValue): JsResult[URI] = json match {
      case JsString(uriInJson) => Try {
        new URI(uriInJson)
      } match {
        case Success(uri) => JsSuccess(uri)
        case Failure(_) => JsError(s"Could not parse $uriInJson as valid URI")
      }
      case _ => JsError("URI as String expected")
    }
  }
}

object PlayJsonSyntax extends PlayJsonSyntax
