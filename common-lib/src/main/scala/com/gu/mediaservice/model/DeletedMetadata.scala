package com.gu.mediaservice.model

import org.joda.time.DateTime
import play.api.libs.json._
import play.api.libs.json.JodaReads._
import play.api.libs.json.JodaWrites._
import play.api.libs.functional.syntax._


case class DeletedMetadata(
  deleteTime: DateTime,
  deletedBy: String,
)

object DeletedMetadata {

  implicit val DeletedMetadataReads: Reads[DeletedMetadata] = (
    (__ \ "deleteTime").read[DateTime] ~
    (__ \ "deletedBy").read[String]
  )(DeletedMetadata.apply _)

  implicit val DeletedMetadataWrites: Writes[DeletedMetadata] = (
    (__ \ "deleteTime").write[DateTime] ~
    (__ \ "deleteTime").write[String]
  )(unlift(DeletedMetadata.unapply))
}

trait DeletedMetadataResponse {

  // the types are in the arguments because of a whining scala compiler
  def DeletedMetadataEntity(id: String): Writes[DeletedMetadata] = (
      (__ \ "deleteTime").write[DateTime] ~
      (__ \ "deletedBy").write[String]
    )(unlift(DeletedMetadata.unapply))
}
