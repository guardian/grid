package com.gu.mediaservice.model

import java.net.{URI, URLEncoder}
import com.gu.mediaservice.lib.argo.model.{Action, EmbeddedEntity}
import org.joda.time.DateTime
import play.api.libs.json._
import play.api.libs.json.JodaReads._
import play.api.libs.json.JodaWrites._
import play.api.libs.functional.syntax._


case class Edits(
  archived: Boolean = false,
  labels: List[String] = List(),
  metadata: ImageMetadata,
  usageRights: Option[UsageRights] = None,
  photoshoot: Option[Photoshoot] = None,
  lastModified: Option[DateTime] = None
)

object Edits {
  val emptyMetadata = ImageMetadata()

  val Photoshoot = "photoshoot"
  val PhotoshootTitle = "photoshootTitle"
  val Labels = "labels"
  val Archived = "archived"
  val Metadata = "metadata"
  val UsageRights = "usageRights"
  val LastModified = "lastModified"

  implicit val EditsReads: Reads[Edits] = (
    (__ \ Archived).readNullable[Boolean].map(_ getOrElse false) ~
    (__ \ Labels).readNullable[List[String]].map(_ getOrElse Nil) ~
    (__ \ Metadata).readNullable[ImageMetadata].map(_ getOrElse emptyMetadata) ~
    (__ \ UsageRights).readNullable[UsageRights] ~
    (__ \ Photoshoot).readNullable[Photoshoot] ~
    (__ \ LastModified).readNullable[DateTime]
  )(Edits.apply _)

  implicit val EditsWrites: Writes[Edits] = (
    (__ \ Archived).write[Boolean] ~
    (__ \ Labels).write[List[String]] ~
    (__ \ Metadata).writeNullable[ImageMetadata].contramap(noneIfEmptyMetadata) ~
    (__ \ UsageRights).writeNullable[UsageRights] ~
    (__ \ Photoshoot).writeNullable[Photoshoot] ~
    (__ \ LastModified).writeNullable[DateTime]
  )(unlift(Edits.unapply))

  def getEmpty = Edits(metadata = emptyMetadata)

  def noneIfEmptyMetadata(m: ImageMetadata): Option[ImageMetadata] =
    if(m == emptyMetadata) None else Some(m)

}

trait EditsResponse {
  val metadataBaseUri: String

  type ArchivedEntity = EmbeddedEntity[Boolean]
  type SetEntity = EmbeddedEntity[Seq[EmbeddedEntity[String]]]
  type MetadataEntity = EmbeddedEntity[ImageMetadata]
  type UsageRightsEntity = EmbeddedEntity[UsageRights]
  type PhotoshootEntity = EmbeddedEntity[Photoshoot]

  def editsEmbeddedEntity(id: String, edits: Edits) =
    EmbeddedEntity(entityUri(id), Some(Json.toJson(edits)(editsEntity(id))))

  // the types are in the arguments because of a whining scala compiler
  def editsEntity(id: String): Writes[Edits] = (
      (__ \ Edits.Archived).write[ArchivedEntity].contramap(archivedEntity(id, _: Boolean)) ~
      (__ \ Edits.Labels).write[SetEntity].contramap(setEntity(id, "labels", _: List[String])) ~
      (__ \ Edits.Metadata).write[MetadataEntity].contramap(metadataEntity(id, _: ImageMetadata)) ~
      (__ \ Edits.UsageRights).write[UsageRightsEntity].contramap(usageRightsEntity(id, _: Option[UsageRights])) ~
      (__ \ Edits.Photoshoot).write[PhotoshootEntity].contramap(photoshootEntity(id, _: Option[Photoshoot])) ~
      (__ \ Edits.LastModified).writeNullable[DateTime]
    )(unlift(Edits.unapply))

  def photoshootEntity(id: String, photoshoot: Option[Photoshoot]): PhotoshootEntity =
    EmbeddedEntity(entityUri(id, "/photoshoot"), photoshoot)

  def archivedEntity(id: String, a: Boolean): ArchivedEntity =
    EmbeddedEntity(entityUri(id, "/archived"), Some(a))

  def metadataEntity(id: String, m: ImageMetadata): MetadataEntity =
    EmbeddedEntity(entityUri(id, "/metadata"), Some(m), actions = List(
      Action("set-from-usage-rights", entityUri(id, "/metadata/set-from-usage-rights"), "POST")
    ))

  def usageRightsEntity(id: String, u: Option[UsageRights]): UsageRightsEntity =
    u.map(i => EmbeddedEntity(entityUri(id, "/usage-rights"), Some(i)))
     .getOrElse(EmbeddedEntity(entityUri(id, "/usage-rights"), None))

  def setEntity(id: String, setName: String, labels: List[String]): SetEntity =
    EmbeddedEntity(entityUri(id, s"/$setName"), Some(labels.map(setUnitEntity(id, setName, _))))

  def setUnitEntity(id: String, setName: String, name: String): EmbeddedEntity[String] =
    EmbeddedEntity(entityUri(id, s"/$setName/${URLEncoder.encode(name, "UTF-8")}"), Some(name))

  private def entityUri(id: String, endpoint: String = ""): URI =
    URI.create(s"$metadataBaseUri/metadata/$id$endpoint")

  def labelsUri(id: String) = entityUri(id, "/labels")

  def metadataUri(id: String) = entityUri(id, "/metadata")
}
