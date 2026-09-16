package com.gu.mediaservice.model

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.libs.json.{JsObject, JsSuccess, Json}

class FileMetadataTest extends AnyFunSpec with Matchers {

  private def baseJson(extraFields: (String, Json.JsValueWrapper)*): JsObject = Json.obj(
    "iptc" -> Json.obj(),
    "exif" -> Json.obj(),
    "exifSub" -> Json.obj(),
    "xmp" -> Json.obj()
  ) ++ Json.obj(extraFields: _*)

  describe("c2pa Reads") {
    it("should read an available C2PA manifest") {
      val json = baseJson("c2pa" -> Json.obj("isAvailable" -> true))

      json.validate[FileMetadata] shouldBe JsSuccess(FileMetadata(c2pa = FileMetadata.C2paAvailable))
    }

    it("should read an explicitly empty c2pa object as unavailable") {
      val json = baseJson("c2pa" -> Json.obj())

      json.validate[FileMetadata] shouldBe JsSuccess(FileMetadata(c2pa = FileMetadata.NoC2PA))
    }

    it("should default to unavailable when the c2pa key is absent entirely (e.g. a legacy document indexed before this field existed)") {
      val json = baseJson()

      json.validate[FileMetadata] shouldBe JsSuccess(FileMetadata(c2pa = FileMetadata.NoC2PA))
    }
  }

  describe("c2pa Writes") {
    it("should write an available C2PA manifest") {
      val fileMetadata = FileMetadata(c2pa = FileMetadata.C2paAvailable)

      (Json.toJson(fileMetadata) \ "c2pa").as[JsObject] shouldBe Json.obj("isAvailable" -> true)
    }

    it("should write an unavailable C2PA manifest as an empty object") {
      val fileMetadata = FileMetadata(c2pa = FileMetadata.NoC2PA)

      (Json.toJson(fileMetadata) \ "c2pa").as[JsObject] shouldBe Json.obj()
    }
  }
}
