package com.gu.mediaservice.model

import org.joda.time.DateTime
import play.api.libs.json.JodaReads.jodaDateReads
import play.api.libs.json.JodaWrites.jodaDateWrites
import play.api.libs.json._
import play.api.libs.functional.syntax._

case class SyndicationRights(
  published: Option[DateTime],
  suppliers: Seq[Supplier],
  rights: Seq[Right],
  isInferred: Boolean = false
) {
  def isRightsAcquired: Boolean = rights.flatMap(_.acquired).contains(true)
  def isAvailableForSyndication: Boolean = isRightsAcquired && published.exists(_.isBeforeNow)
}
object SyndicationRights {
  implicit val dateWrites = jodaDateWrites("yyyy-MM-dd'T'HH:mm:ss.SSSZZ")
  implicit val dateReads = jodaDateReads("yyyy-MM-dd'T'HH:mm:ss.SSSZZ")

  val reads: Reads[SyndicationRights] = Json.using[Json.WithDefaultValues].reads[SyndicationRights]

  val writes: Writes[SyndicationRights] = (
    (__ \ "published").writeNullable[DateTime] ~
    (__ \ "suppliers").write[Seq[Supplier]] ~
    (__ \ "rights").write[Seq[Right]] ~
    (__ \ "isInferred").write[Boolean]
  ){ sr: SyndicationRights => (sr.published, sr.suppliers, sr.rights, sr.isInferred) }

  implicit val formats: Format[SyndicationRights] = Format(reads, writes)
}

case class Supplier(
  supplierName: Option[String],
  supplierId: Option[String],
  prAgreement: Option[Boolean])
object Supplier {
  val reads: Reads[Supplier] = Json.reads[Supplier]
  val writes: Writes[Supplier] = (
    (__ \ "supplierName").writeNullable[String] ~
    (__ \ "supplierId").writeNullable[String] ~
    (__ \ "prAgreement").writeNullable[Boolean]
  ){ s: Supplier => (s.supplierName, s.supplierId, s.prAgreement) }

  implicit val formats: Format[Supplier] = Format(reads, writes)
}

case class Right(
  rightCode: String,
  acquired: Option[Boolean],
  properties: Seq[Property])
object Right {
  val reads: Reads[Right] = Json.reads[Right]
  val writes: Writes[Right] = (
    (__ \ "rightCode").write[String] ~
    (__ \ "acquired").writeNullable[Boolean] ~
    (__ \ "properties").write[Seq[Property]]
  ){ r: Right => (r.rightCode, r.acquired, r.properties) }

  implicit val formats: Format[Right] = Format(reads, writes)
}

case class Property(
  propertyCode: String,
  expiresOn: Option[DateTime],
  value: Option[String])
object Property {
  implicit val dateWrites = jodaDateWrites("yyyy-MM-dd'T'HH:mm:ss.SSSZZ")
  implicit val dateReads = jodaDateReads("yyyy-MM-dd'T'HH:mm:ss.SSSZZ")

  val reads: Reads[Property] = Json.reads[Property]
  val writes: Writes[Property] = (
    (__ \ "propertyCode").write[String] ~
    (__ \ "expiresOn").writeNullable[DateTime] ~
    (__ \ "value").writeNullable[String]
  ){ r: Property => (r.propertyCode, r.expiresOn, r.value) }

  implicit val formats: Format[Property] = Format(reads, writes)
}
