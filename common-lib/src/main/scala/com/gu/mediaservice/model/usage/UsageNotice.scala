package com.gu.mediaservice.model.usage

import com.gu.mediaservice.lib.formatting.printDateTime
import org.joda.time.DateTime
import play.api.libs.json.{JodaWrites, JsArray, JsObject, Json}

case class UsageNotice(mediaId: String, usageJson: JsArray) {
  def toJson = Json.obj(
    "id" -> mediaId,
    "data" -> usageJson,
    "lastModified" -> printDateTime(DateTime.now())
  )

  override def equals(o: Any) = o match {
    case that: UsageNotice => that.hashCode == this.hashCode
    case _ => false
  }

  override def hashCode = {
    val result = Json.toJson(
      usageJson.as[List[JsObject]]
        .map(_ - "lastModified")
        .map(_ - "dateAdded")
    ).as[JsArray].toString

    result.hashCode
  }
}
