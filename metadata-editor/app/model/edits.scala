package model

import java.net.{URLEncoder, URI}
import lib.Config
import Config.rootUri
import com.gu.mediaservice.lib.argo.model.EmbeddedEntity
import com.gu.mediaservice.model.ImageMetadata
import play.api.libs.json._
import play.api.libs.functional.syntax._

case class Edits(archived: Boolean, labels: List[String], metadata: ImageMetadata)

object Edits {
  type ArchivedEntity = EmbeddedEntity[Boolean]
  type LabelsEntity = EmbeddedEntity[Seq[EmbeddedEntity[String]]]
  type MetadataEntity = EmbeddedEntity[ImageMetadata]

  implicit val EditsReads: Reads[Edits] = (
    (__ \ "archived").readNullable[Boolean].map(_ getOrElse false) ~
    (__ \ "labels").readNullable[List[String]].map(_ getOrElse Nil) ~
    (__ \ "metadata").readNullable[ImageMetadata].map(_ getOrElse emptyMetadata)
  )(Edits.apply _)

  implicit val EditsWrites: Writes[Edits] = (
      (__ \ "archived").write[Boolean] ~
      (__ \ "labels").write[List[String]] ~
      (__ \ "metadata").writeNullable[ImageMetadata].contramap(noneIfEmptyMetadata)
    )(unlift(Edits.unapply))

  // the types are in the arguments because of a whining scala compiler
  def EditsWritesArgo(id: String): Writes[Edits] = (
      (__ \ "archived").write[ArchivedEntity].contramap(archivedEntity(id, _: Boolean)) ~
      (__ \ "labels").write[LabelsEntity].contramap(labelsEntity(id, _: List[String])) ~
      (__ \ "metadata").writeNullable[MetadataEntity].contramap(metadataEntity(id, _: ImageMetadata))
    )(unlift(Edits.unapply))

  def noneIfEmptyMetadata(m: ImageMetadata): Option[ImageMetadata] =
    if(m == emptyMetadata) None else Some(m)

  def archivedEntity(id: String, a: Boolean): ArchivedEntity =
    EmbeddedEntity(entityUri(id, "/archived"), Some(a))

  def metadataEntity(id: String, m: ImageMetadata): Option[MetadataEntity] =
    noneIfEmptyMetadata(m).map(i => EmbeddedEntity(entityUri(id, "/metadata"), Some(i)))

  def labelsEntity(id: String, labels: List[String]): LabelsEntity =
    EmbeddedEntity(entityUri(id, s"/labels"), Some(labels.map(labelEntity(id, _))))

  def labelEntity(id: String, label: String): EmbeddedEntity[String] =
    EmbeddedEntity(entityUri(id, s"/labels/${URLEncoder.encode(label, "UTF-8")}"), Some(label))

  // We could set these as default on the case class, but that feel like polluting
  // the ocean instead of just polluting this little puddle.
  val emptyMetadata =
    ImageMetadata(None, None, None, None, None, None, None, None, None, None, None, List(), None, None, None, None)

  def entityUri(id: String, endpoint: String = ""): URI =
    URI.create(s"$rootUri/metadata/$id$endpoint")
}
