package com.gu.mediaservice.lib.json

import com.gu.mediaservice.model.{Asset, FileMetadata, Handout, Image, ImageMetadata, UploadInfo}
import org.joda.time.{DateTime, DateTimeZone}
import org.scalatest.Inside.inside
import org.scalatest.{FreeSpec, Matchers}
import play.api.libs.json.{JsObject, JsString, Json}

import java.net.URI

class JsonOrderingTest extends FreeSpec with Matchers {
  /**
    * The order of JSON documents is not strictly in accordance with the RFC but the Play library did maintain it
    * until 2.6.11 and does again from 2.8.0. See https://github.com/playframework/play-json/pull/253
    * This is helpful for debugging and for the super-power-users that look at the API as it means that related fields
    * are grouped together throughout our API.
    * This test (which fails with play-json 2.6.14 is here to prevent a further regression. It does mean that we'll
    * need to jump to Play 2.8 for our next upgrade (which is likely to be what we do anyway...)
    */
  "Play Json writes maintain ordering" in {
    val dt = new DateTime(2021,1,20,12,0,0, DateTimeZone.forID("America/New_York"))
    val image = Image(id = "id",
      uploadTime = dt,
      identifiers = Map.empty,
      uploadedBy = "Biden",
      lastModified = None,
      uploadInfo = UploadInfo(None),
      source = Asset(new URI("fileUri"), None, None, None),
      optimisedPng = None,
      originalUsageRights = Handout(None),
      originalMetadata = ImageMetadata(),
      fileMetadata = FileMetadata(),
      userMetadata = None,
      thumbnail = None,
      metadata = ImageMetadata(),
      usageRights = Handout(None),
    )
    val json = Json.toJson(image)
    inside(json) {
      case jso: JsObject =>
        /* this only seems to break when an extra field is added to the JsObject
         * presumably this is done somewhere inside Play which was causing the mis-ordering */
        val newJso = jso + ("extraField" -> JsString("value"))
        newJso.fields.map(_._1) shouldBe Seq(
        "id",
        "uploadTime",
        "uploadedBy",
        "identifiers",
        "uploadInfo",
        "source",
        "fileMetadata",
        "metadata",
        "originalMetadata",
        "usageRights",
        "originalUsageRights",
        "exports",
        "usages",
        "leases",
        "collections",
        "extraField"
      )
    }
  }

}
