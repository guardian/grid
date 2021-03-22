package com.gu.mediaservice.model

import org.joda.time.DateTime
import play.api.libs.json.JodaReads.jodaDateReads
import play.api.libs.json.JodaWrites.jodaDateWrites
import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.lib.collections.CollectionsManager

case class Collection private (path: List[String], actionData: ActionData, description: String) {
  // We lowercase on pathId so that we can search case-insensitively
  val pathId = CollectionsManager.pathToPathId(path)
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
    // HACK: path should be an NonEmptyList, till then, this'll do
    val description = path.lastOption.getOrElse("")
    Collection(path, actionData, description)
  }
}

// Following the crop structure
case class ActionData(author: String, date: DateTime)
object ActionData {
  // TODO: Use the generic formats for DateTime
  implicit val dateWrites = jodaDateWrites("yyyy-MM-dd'T'HH:mm:ss.SSSZZ")
  implicit val dateReads = jodaDateReads("yyyy-MM-dd'T'HH:mm:ss.SSSZZ")
  implicit def formats: Format[ActionData] = Json.format[ActionData]
}
