package com.gu.mediaservice.model

import org.joda.time.DateTime
import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.lib.collections.CollectionsManager

case class Collection private (path: List[String], actionData: ActionData, description: String) {
  val pathId = CollectionsManager.pathToString(path)
}

object Collection {
  val reads: Reads[Collection] = Json.reads[Collection]
  val writes: Writes[Collection] = (
    (__ \ "path").write[List[String]] ~
    (__ \ "pathId").write[String] ~
    (__ \ "description").write[String] ~
    (__ \ "actionData").write[ActionData]
  ){ col: Collection => (col.path, col.pathId, col.description, col.actionData) }

  implicit val formats: Format[Collection] = Format(reads, writes)

  // We use this to ensure we are creating valid `Collection`s
  def build(path: List[String], actionData: ActionData) = {
    val lowerPath = path.map(_.toLowerCase)
    // HACK: path should be an NonEmptyList, till then, this'll do
    val description = path.lastOption.getOrElse("")
    Collection(lowerPath, actionData, description)
  }
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
