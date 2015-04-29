package model

import java.net.{URLEncoder, URI}
import lib.Config
import Config.rootUri
import com.gu.mediaservice.lib.argo.model.EmbeddedEntity
import com.gu.mediaservice.model.{UsageRights, ImageMetadata}
import play.api.libs.json._
import play.api.libs.functional.syntax._

case class Edits(
  archived: Boolean = false,
  labels: List[String] = List(),
  metadata: ImageMetadata,
  usageRights: Option[UsageRights] = None
)

object Edits {
  type ArchivedEntity = EmbeddedEntity[Boolean]
  type SetEntity = EmbeddedEntity[Seq[EmbeddedEntity[String]]]
  type MetadataEntity = EmbeddedEntity[ImageMetadata]
  type UsageRightsEntity = EmbeddedEntity[UsageRights]

  implicit val EditsReads: Reads[Edits] = (
    (__ \ "archived").readNullable[Boolean].map(_ getOrElse false) ~
    (__ \ "labels").readNullable[List[String]].map(_ getOrElse Nil) ~
    (__ \ "metadata").readNullable[ImageMetadata].map(_ getOrElse emptyMetadata) ~
    (__ \ "usageRights").readNullable[UsageRights]
  )(Edits.apply _)

  implicit val EditsWrites: Writes[Edits] = (
      (__ \ "archived").write[Boolean] ~
      (__ \ "labels").write[List[String]] ~
      (__ \ "metadata").writeNullable[ImageMetadata].contramap(noneIfEmptyMetadata) ~
      (__ \ "usageRights").writeNullable[UsageRights]
    )(unlift(Edits.unapply))

  // the types are in the arguments because of a whining scala compiler
  def EditsWritesArgo(id: String): Writes[Edits] = (
      (__ \ "archived").write[ArchivedEntity].contramap(archivedEntity(id, _: Boolean)) ~
      (__ \ "labels").write[SetEntity].contramap(setEntity(id, "labels", _: List[String])) ~
      (__ \ "metadata").writeNullable[MetadataEntity].contramap(metadataEntity(id, _: ImageMetadata)) ~
      (__ \ "usageRights").writeNullable[UsageRightsEntity].contramap(usageRightsEntity(id, _: Option[UsageRights]))
    )(unlift(Edits.unapply))

  def noneIfEmptyMetadata(m: ImageMetadata): Option[ImageMetadata] =
    if(m == emptyMetadata) None else Some(m)

  def archivedEntity(id: String, a: Boolean): ArchivedEntity =
    EmbeddedEntity(entityUri(id, "/archived"), Some(a))

  def metadataEntity(id: String, m: ImageMetadata): Option[MetadataEntity] =
    noneIfEmptyMetadata(m).map(i => EmbeddedEntity(entityUri(id, "/metadata"), Some(i)))

  def usageRightsEntity(id: String, u: Option[UsageRights]): Option[UsageRightsEntity] =
    u.map(i => EmbeddedEntity(entityUri(id, "/usage-rights"), Some(i)))

  def setEntity(id: String, setName: String, labels: List[String]): SetEntity =
    EmbeddedEntity(entityUri(id, s"/$setName"), Some(labels.map(setUnitEntity(id, setName, _))))

  def setUnitEntity(id: String, setName: String, name: String): EmbeddedEntity[String] =
    EmbeddedEntity(entityUri(id, s"/$setName/${URLEncoder.encode(name, "UTF-8")}"), Some(name))

  // We could set these as default on the case class, but that feel like polluting
  // the ocean instead of just polluting this little puddle.
  val emptyMetadata =
    ImageMetadata(None, None, None, None, None, None, None, None, None, None, None, List(), None, None, None, None)

  def entityUri(id: String, endpoint: String = ""): URI =
    URI.create(s"$rootUri/metadata/$id$endpoint")

  def getEmpty = Edits(metadata = emptyMetadata)
}
