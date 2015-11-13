package com.gu.mediaservice.model

import org.joda.time.DateTime
import play.api.libs.json._

case class Collection(path: List[String], actionData: ActionData)
object Collection {
  implicit def formats: Format[Collection] = Json.format[Collection]
}

// Following the crop structure
// TODO: Use this in crop too
case class ActionData(author: String, date: DateTime)
object ActionData {
  implicit def formats: Format[ActionData] = Json.format[ActionData]
  // TODO: Use the generic formats for DateTime
  implicit val dateWrites = Writes.jodaDateWrites("yyyy-MM-dd'T'HH:mm:ss.SSSZZ")
  implicit val dateReads = Reads.jodaDateReads("yyyy-MM-dd'T'HH:mm:ss.SSSZZ")
}
