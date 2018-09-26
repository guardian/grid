package com.gu.mediaservice.model

import org.scalatest.prop.{Checkers, PropertyChecks}
import org.scalatest.{FreeSpec, Matchers}
import play.api.libs.json.Json

class FileMetadataTest extends FreeSpec with Matchers with Checkers with PropertyChecks {

  "test remove long values from icc fields" - {
    "leave all short values alone" in {
      val fm = new FileMetadata(Map(), Map(), Map(), Map(), Map(("hello" -> "goodbye")), Map(), None, Map())
      val json = Json.toJson(fm).toString()
      val fmRehydrated = Json.fromJson[FileMetadata](Json.parse(json)).get
      fmRehydrated should be (new FileMetadata(Map(), Map(), Map(), Map(), Map("hello" -> "goodbye"), Map(), None, Map()))
    }
    "remove a single long value" in {
      val A5000 = (1 to 5000).toList.mkString(",")
      val fm = new FileMetadata(Map(), Map(), Map(), Map(), Map("hello" -> "goodbye", "A5000" -> A5000), Map(), None, Map())
      val json = Json.toJson(fm).toString()
      val fmRehydrated = Json.fromJson[FileMetadata](Json.parse(json)).get
      fmRehydrated should be ( new FileMetadata(Map(), Map(), Map(), Map(), Map("hello" -> "goodbye", "removedFields" -> "A5000"), Map(), None, Map()))
    }
    "remove multiple long values" in {
      val A5000 = (1 to 5000).toList.mkString(",")
      val B5000 = (1 to 10000).toList.mkString(",")
      val fm = new FileMetadata(Map(), Map(), Map(), Map(), Map("hello" -> "goodbye", "A5000" -> A5000, "B5000" -> B5000), Map(), None, Map())
      val json = Json.toJson(fm).toString()
      val fmRehydrated = Json.fromJson[FileMetadata](Json.parse(json)).get
      fmRehydrated should be ( new FileMetadata(Map(), Map(), Map(), Map(), Map("hello" -> "goodbye", "removedFields" -> "A5000, B5000"), Map(), None, Map()))
    }
  }

  "dehydrate and rehydrate a file metadata object" - {
    "dehydrate an empty object" in {
      val fm = new FileMetadata()
      val json = Json.toJson(fm).toString()
      json should be ("{\"iptc\":{},\"exif\":{},\"exifSub\":{},\"xmp\":{},\"icc\":{},\"getty\":{},\"colourModelInformation\":{}}")
    }

    "rehydrate an empty object" in {
      val json = "{\"iptc\":{},\"exif\":{},\"exifSub\":{},\"xmp\":{},\"icc\":{},\"getty\":{},\"colourModelInformation\":{}}"
      val fm = Json.fromJson[FileMetadata](Json.parse(json)).get
      fm should be (new FileMetadata(Map(), Map(), Map(), Map(), Map(), Map(), None, Map()))
    }
  }


}
