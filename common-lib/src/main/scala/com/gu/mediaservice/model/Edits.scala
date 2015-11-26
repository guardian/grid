package com.gu.mediaservice.model

import java.net.{URI, URLEncoder}

import com.gu.mediaservice.lib.argo.model.{Action, EmbeddedEntity}
import com.gu.mediaservice.lib.collections.CollectionsManager
import play.api.libs.json._
import play.api.libs.functional.syntax._


case class Edits(
  archived: Boolean = false,
  labels: List[String] = Nil,
  metadata: ImageMetadata,
  usageRights: Option[UsageRights] = None,
  collections: List[Collection] = Nil
)

object Edits {
  val emptyMetadata = ImageMetadata()

  implicit val EditsReads: Reads[Edits] = (
    (__ \ "archived").readNullable[Boolean].map(_ getOrElse false) ~
    (__ \ "labels").readNullable[List[String]].map(_ getOrElse Nil) ~
    (__ \ "metadata").readNullable[ImageMetadata].map(_ getOrElse emptyMetadata) ~
    (__ \ "usageRights").readNullable[UsageRights] ~
    (__ \ "collections").readNullable[List[Collection]].map(_ getOrElse Nil)
  )(Edits.apply _)

  implicit val EditsWrites: Writes[Edits] = (
    (__ \ "archived").write[Boolean] ~
    (__ \ "labels").write[List[String]] ~
    (__ \ "metadata").writeNullable[ImageMetadata].contramap(noneIfEmptyMetadata) ~
    (__ \ "usageRights").writeNullable[UsageRights] ~
    (__ \ "collections").write[List[Collection]].contramap(CollectionsManager.onlyLatest)
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
  type CollectionsEntity = EmbeddedEntity[List[EmbeddedEntity[Collection]]]

  def editsEmbeddedEntity(id: String, edits: Edits) =
    EmbeddedEntity(entityUri(id), Some(Json.toJson(edits)(editsEntity(id))))

  // the types are in the arguments because of a whining scala compiler
  def editsEntity(id: String): Writes[Edits] = (
      (__ \ "archived").write[ArchivedEntity].contramap(archivedEntity(id, _: Boolean)) ~
      (__ \ "labels").write[SetEntity].contramap(setEntity(id, "labels", _: List[String])) ~
      (__ \ "metadata").write[MetadataEntity].contramap(metadataEntity(id, _: ImageMetadata)) ~
      (__ \ "usageRights").write[UsageRightsEntity].contramap(usageRightsEntity(id, _: Option[UsageRights])) ~
      (__ \ "collections").write[CollectionsEntity].contramap(collectionsEntity(id, _: List[Collection]))
    )(unlift(Edits.unapply))

  def archivedEntity(id: String, a: Boolean): ArchivedEntity =
    EmbeddedEntity(entityUri(id, "/archived"), Some(a))

  def metadataEntity(id: String, m: ImageMetadata): MetadataEntity =
    EmbeddedEntity(entityUri(id, "/metadata"), Some(m), actions = List(
      Action("set-from-usage-rights", entityUri(id, "/metadata/set-from-usage-rights"), "POST")
    ))

  def usageRightsEntity(id: String, u: Option[UsageRights]): UsageRightsEntity =
    u.map(i => EmbeddedEntity(entityUri(id, "/usage-rights"), Some(i)))
     .getOrElse(EmbeddedEntity(entityUri(id, "/usage-rights"), None))

  def collectionEntity(id: String, collection: Collection) =
    EmbeddedEntity(entityUri(id, s"/collections/${collection.pathId}"), Some(collection))

  def collectionsEntity(id: String, collections: List[Collection]) = {
    EmbeddedEntity(entityUri(id, "/collections"), Some(CollectionsManager.onlyLatest(collections) map (collectionEntity(id, _))))
  }

  def setEntity(id: String, setName: String, set: List[String]): SetEntity =
    EmbeddedEntity(entityUri(id, s"/$setName"), Some(set.map(setUnitEntity(id, setName, _))))

  def setUnitEntity(id: String, setName: String, name: String): EmbeddedEntity[String] =
    EmbeddedEntity(entityUri(id, s"/$setName/$name"), Some(name))

  private def entityUri(id: String, endpoint: String = ""): URI =
    URI.create(s"$metadataBaseUri/metadata/$id$endpoint")

  def labelsUri(id: String) = entityUri(id, "/labels")

  def metadataUri(id: String) = entityUri(id, "/metadata")
}
