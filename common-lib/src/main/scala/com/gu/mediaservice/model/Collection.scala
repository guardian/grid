package com.gu.mediaservice.model

import java.net.URLDecoder.decode
import java.net.URLEncoder.encode
import org.joda.time.DateTime
import play.api.libs.json._
import play.api.libs.functional.syntax._

case class Collection(path: List[String], actionData: ActionData) {
  val pathId = CollectionManager.pathToString(path)
}
object Collection {
  val reads: Reads[Collection] = Json.reads[Collection]
  val writes: Writes[Collection] = (
    (__ \ "pathId").write[String] ~
    (__ \ "path").write[List[String]] ~
    (__ \ "actionData").write[ActionData]
  ){ col: Collection => (col.pathId, col.path, col.actionData) }

  implicit val formats: Format[Collection] = Format(reads, writes)
}

object CollectionManager {
  val delimiter = "/"
  val enc = "UTF-8"
  def decodePathBit(s: String) = decode(s, enc)
  def encodePathBit(s: String) = encode(s, enc)

  def stringToPath(s: String) = s.split(delimiter).map(decodePathBit)
  def pathToString(path: List[String]) = path.map(encodePathBit).mkString(delimiter)
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
