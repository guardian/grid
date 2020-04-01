package com.gu.mediaservice.model

import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json._

class MimeTypeTest extends FunSpec with Matchers {
  it("should construct a mime type from a known string") {
    MimeType("image/jpeg") should be (Jpeg)
    MimeType("image/png") should be (Png)
    MimeType("image/tiff") should be (Tiff)
  }

  it("should construct a mime type from a legacy string") {
    MimeType("jpg") should be (Jpeg)
    MimeType("png") should be (Png)
  }

  it("should raise an UnsupportedMimeTypeException with an unsupported mime type") {
    an [UnsupportedMimeTypeException] should be thrownBy MimeType("audio/mp3")
  }

  it("should be able to go to a string and back") {
    val mimeTypeString = Jpeg.toString
    mimeTypeString should be ("image/jpeg")
    MimeType(mimeTypeString) should be (Jpeg)
  }

  it("should have a name") {
    Jpeg.name should be ("image/jpeg")
    Png.name should be ("image/png")
    Tiff.name should be ("image/tiff")
  }

  it("should have a file extension") {
    Jpeg.fileExtension should be (".jpg")
    Png.fileExtension should be (".png")
    Tiff.fileExtension should be (".tiff")
  }

  it("should serialise to json") {
    Json.toJson(Jpeg) should be (JsString("image/jpeg"))
    Json.toJson(Png) should be (JsString("image/png"))
    Json.toJson(Tiff) should be (JsString("image/tiff"))
  }

  it("should deserialise from json") {
    JsString("image/jpeg").as[MimeType] should be (Jpeg)
    JsString("image/png").as[MimeType] should be (Png)
    JsString("image/tiff").as[MimeType] should be (Tiff)
  }

  it("should raise an UnsupportedMimeTypeException when deserialising an unsupported mime type") {
    an [UnsupportedMimeTypeException] should be thrownBy JsString("audio/mp3").as[MimeType]
  }
}
