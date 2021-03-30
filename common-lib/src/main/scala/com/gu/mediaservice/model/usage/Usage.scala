package com.gu.mediaservice.model.usage

import play.api.libs.json._
import org.joda.time.DateTime
import play.api.libs.functional.syntax._

case class Usage(
  id: String,
  references: List[UsageReference],
  platform: UsageType,
  media: String,
  status: UsageStatus,
  dateAdded: Option[DateTime],
  dateRemoved: Option[DateTime],
  lastModified: DateTime,

  // TODO collapse this field into an `Option[UsageMetadata]`
  printUsageMetadata: Option[PrintUsageMetadata] = None,
  digitalUsageMetadata: Option[DigitalUsageMetadata] = None,
  syndicationUsageMetadata: Option[SyndicationUsageMetadata] = None,
  frontUsageMetadata: Option[FrontUsageMetadata] = None,
  downloadUsageMetadata: Option[DownloadUsageMetadata] = None
)
object Usage {
  import com.gu.mediaservice.lib.formatting._

  implicit val writes: Writes[Usage] = (
    (__ \ "id").write[String] ~
      (__ \ "references").write[List[UsageReference]] ~
      (__ \ "platform").write[UsageType] ~
      (__ \ "media").write[String] ~
      (__ \ "status").write[UsageStatus] ~
      (__ \ "dateAdded").writeNullable[String].contramap(printOptDateTime) ~
      (__ \ "dateRemoved").writeNullable[String].contramap(printOptDateTime) ~
      (__ \ "lastModified").write[String].contramap(printDateTime) ~
      (__ \ "printUsageMetadata").writeNullable[PrintUsageMetadata] ~
      (__ \ "digitalUsageMetadata").writeNullable[DigitalUsageMetadata] ~
      (__ \ "syndicationUsageMetadata").writeNullable[SyndicationUsageMetadata] ~
      (__ \ "frontUsageMetadata").writeNullable[FrontUsageMetadata] ~
      (__ \ "downloadUsageMetadata").writeNullable[DownloadUsageMetadata]
    )(unlift(Usage.unapply))

  implicit val reads: Reads[Usage] = (
    (__ \ "id").read[String] ~
      (__ \ "references").read[List[UsageReference]] ~
      (__ \ "platform").read[UsageType] ~
      (__ \ "media").read[String] ~
      (__ \ "status").read[UsageStatus] ~
      (__ \ "dateAdded").readNullable[String].map(parseOptDateTime) ~
      (__ \ "dateRemoved").readNullable[String].map(parseOptDateTime) ~
      (__ \ "lastModified").read[String].map(unsafeParseDateTime) ~
      (__ \ "printUsageMetadata").readNullable[PrintUsageMetadata] ~
      (__ \ "digitalUsageMetadata").readNullable[DigitalUsageMetadata] ~
      (__ \ "syndicationUsageMetadata").readNullable[SyndicationUsageMetadata] ~
      (__ \ "frontUsageMetadata").readNullable[FrontUsageMetadata] ~
      (__ \ "downloadUsageMetadata").readNullable[DownloadUsageMetadata]
    )(Usage.apply _)
}
