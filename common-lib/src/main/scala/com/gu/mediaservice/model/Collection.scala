package com.gu.mediaservice.model

import java.net.URI

import org.joda.time.DateTime
import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.lib.argo.model.{Action, EmbeddedEntity}
import com.gu.mediaservice.lib.net.URI.encode

case class Collection(path: List[String], actionData: ActionData) {
  val pathId = CollectionsManager.pathToString(path)
  val pathUri = CollectionsManager.pathToUri(path)
}
object Collection {
  val reads: Reads[Collection] = Json.reads[Collection]
  val writes: Writes[Collection] = (
    (__ \ "pathId").write[String] ~
    (__ \ "path").write[List[String]] ~
    (__ \ "actionData").write[ActionData]
  ){ col: Collection => (col.pathId, col.path, col.actionData) }

  implicit val formats: Format[Collection] = Format(reads, writes)

  def imageUri(rootUri: String, imageId: String, c: Collection) =
    URI.create(s"$rootUri/images/$imageId/${encode(c.pathId)}")

  def asImageEntity(rootUri: String, imageId: String, c: Collection) = {
    // TODO: Currently the GET for this URI does nothing
    val uri = imageUri(rootUri, imageId, c)
    EmbeddedEntity(uri, Some(c), actions = List(
      Action("remove", uri, "DELETE")
    ))
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
