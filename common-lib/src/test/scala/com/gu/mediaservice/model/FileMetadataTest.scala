package com.gu.mediaservice.model

import org.scalatest.prop.{Checkers, PropertyChecks}
import org.scalatest.{FreeSpec, Matchers}
import play.api.libs.json.Json

class FileMetadataTest extends FreeSpec with Matchers with Checkers with PropertyChecks {

  "Dehydrate a non-empty object" - {
    "Leave all short values alone" in {
      val fm = new FileMetadata(Map(), Map(), Map(), Map(), Map(("hello" -> "goodbye")), Map(), None, Map())
      val json = Json.toJson(fm).toString()
      json should be ("{\"iptc\":{},\"exif\":{},\"exifSub\":{},\"xmp\":{},\"icc\":{\"hello\":\"goodbye\"},\"getty\":{},\"colourModelInformation\":{}}")
    }
    "Remove a single long value" in {
      val A5000 = (1 to 5000).toList.mkString(",")
      val fm = new FileMetadata(Map(), Map(), Map(), Map(), Map("hello" -> "goodbye", "A5000" -> A5000), Map(), None, Map())
      val json = Json.toJson(fm).toString()
      json should be ("{\"iptc\":{},\"exif\":{},\"exifSub\":{},\"xmp\":{},\"icc\":{\"hello\":\"goodbye\",\"removedFields\":\"A5000\"},\"getty\":{},\"colourModelInformation\":{}}")
    }
    "Remove multiple long values" in {
      val A5000 = (1 to 5000).toList.mkString(",")
      val B5000 = (1 to 10000).toList.mkString(",")
      val fm = new FileMetadata(Map(), Map(), Map(), Map(), Map("hello" -> "goodbye", "A5000" -> A5000, "B5000" -> B5000), Map(), None, Map())
      val json = Json.toJson(fm).toString()
      json should be ("{\"iptc\":{},\"exif\":{},\"exifSub\":{},\"xmp\":{},\"icc\":{\"hello\":\"goodbye\",\"removedFields\":\"A5000, B5000\"},\"getty\":{},\"colourModelInformation\":{}}")
    }
  }

  "Dehydrate and rehydrate a non-empty object" - {
    "Leave all short values alone" in {
      val fm = new FileMetadata(Map(), Map(), Map(), Map(), Map(("hello" -> "goodbye")), Map(), None, Map())
      val json = Json.toJson(fm).toString()
      val fmRehydrated = Json.fromJson[FileMetadata](Json.parse(json)).get
      fmRehydrated should be (new FileMetadata(Map(), Map(), Map(), Map(), Map("hello" -> "goodbye"), Map(), None, Map()))
    }
    "Remove a single long value" in {
      val A5000 = (1 to 5000).toList.mkString(",")
      val fm = new FileMetadata(Map(), Map(), Map(), Map(), Map("hello" -> "goodbye", "A5000" -> A5000), Map(), None, Map())
      val json = Json.toJson(fm).toString()
      val fmRehydrated = Json.fromJson[FileMetadata](Json.parse(json)).get
      fmRehydrated should be ( new FileMetadata(Map(), Map(), Map(), Map(), Map("hello" -> "goodbye", "removedFields" -> "A5000"), Map(), None, Map()))
    }
    "Remove multiple long values" in {
      val A5000 = (1 to 5000).toList.mkString(",")
      val B5000 = (1 to 10000).toList.mkString(",")
      val fm = new FileMetadata(Map(), Map(), Map(), Map(), Map("hello" -> "goodbye", "A5000" -> A5000, "B5000" -> B5000), Map(), None, Map())
      val json = Json.toJson(fm).toString()
      val fmRehydrated = Json.fromJson[FileMetadata](Json.parse(json)).get
      fmRehydrated should be ( new FileMetadata(Map(), Map(), Map(), Map(), Map("hello" -> "goodbye", "removedFields" -> "A5000, B5000"), Map(), None, Map()))
    }
  }

  "Dehydrate and rehydrate an empty file metadata object" - {
    "Dehydrate" in {
      val fm = new FileMetadata()
      val json = Json.toJson(fm).toString()
      json should be ("{\"iptc\":{},\"exif\":{},\"exifSub\":{},\"xmp\":{},\"icc\":{},\"getty\":{},\"colourModelInformation\":{}}")
    }

    "Rehydrate" in {
      val json = "{\"iptc\":{},\"exif\":{},\"exifSub\":{},\"xmp\":{},\"icc\":{},\"getty\":{},\"colourModelInformation\":{}}"
      val fm = Json.fromJson[FileMetadata](Json.parse(json)).get
      fm should be (new FileMetadata(Map(), Map(), Map(), Map(), Map(), Map(), None, Map()))
    }
  }


}
