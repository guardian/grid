package com.gu.mediaservice.model

import org.joda.time.DateTime
import play.api.libs.json._
import play.api.libs.json.JodaReads._
import play.api.libs.json.JodaWrites._
import play.api.libs.functional.syntax._


case class SoftDeletedMetadata(
  deleteTime: DateTime,
  deletedBy: String,
)

object SoftDeletedMetadata {

  implicit val SoftDeletedMetadataReads: Reads[SoftDeletedMetadata] = (
    (__ \ "deleteTime").read[DateTime] ~
    (__ \ "deletedBy").read[String]
  )(SoftDeletedMetadata.apply _)

  implicit val SoftDeletedMetadataWrites: Writes[SoftDeletedMetadata] = (
    (__ \ "deleteTime").write[DateTime] ~
    (__ \ "deletedBy").write[String]
  )(unlift(SoftDeletedMetadata.unapply))
}

trait SoftDeletedMetadataResponse {

  // the types are in the arguments because of a whining scala compiler
  def SoftDeletedMetadataEntity(id: String): Writes[SoftDeletedMetadata] = (
      (__ \ "deleteTime").write[DateTime] ~
      (__ \ "deletedBy").write[String]
    )(unlift(SoftDeletedMetadata.unapply))
}
