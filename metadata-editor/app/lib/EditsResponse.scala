package lib

import java.net.{URLEncoder, URI}

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.lib.argo.model.EmbeddedEntity
import com.gu.mediaservice.model._


object EditsResponse {

  type ArchivedEntity = EmbeddedEntity[Boolean]
  type SetEntity = EmbeddedEntity[Seq[EmbeddedEntity[String]]]
  type MetadataEntity = EmbeddedEntity[ImageMetadata]
  type UsageRightsEntity = EmbeddedEntity[UsageRights]

  val metadataBaseUri = Config.services.metadataBaseUri

  // the types are in the arguments because of a whining scala compiler
  def editsResponseWrites(id: String): Writes[Edits] = (
      (__ \ "archived").write[ArchivedEntity].contramap(archivedEntity(id, _: Boolean)) ~
      (__ \ "labels").write[SetEntity].contramap(setEntity(id, "labels", _: List[String])) ~
      (__ \ "metadata").writeNullable[MetadataEntity].contramap(metadataEntity(id, _: ImageMetadata)) ~
      (__ \ "usageRights").writeNullable[UsageRightsEntity].contramap(usageRightsEntity(id, _: Option[UsageRights]))
    )(unlift(Edits.unapply))

  def archivedEntity(id: String, a: Boolean): ArchivedEntity =
    EmbeddedEntity(entityUri(id, "/archived"), Some(a))

  def metadataEntity(id: String, m: ImageMetadata): Option[MetadataEntity] =
    Edits.noneIfEmptyMetadata(m).map(i => EmbeddedEntity(entityUri(id, "/metadata"), Some(i)))

  def usageRightsEntity(id: String, u: Option[UsageRights]): Option[UsageRightsEntity] =
    u.map(i => EmbeddedEntity(entityUri(id, "/usage-rights"), Some(i)))

  def setEntity(id: String, setName: String, labels: List[String]): SetEntity =
    EmbeddedEntity(entityUri(id, s"/$setName"), Some(labels.map(setUnitEntity(id, setName, _))))

  def setUnitEntity(id: String, setName: String, name: String): EmbeddedEntity[String] =
    EmbeddedEntity(entityUri(id, s"/$setName/${URLEncoder.encode(name, "UTF-8")}"), Some(name))

  def entityUri(id: String, endpoint: String = ""): URI =
    URI.create(s"$metadataBaseUri/metadata/$id$endpoint")
}
