package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap}
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.MediaLease
import com.gu.mediaservice.model.usage.UsageNotice
import net.logstash.logback.marker.LogstashMarker
import org.joda.time.{DateTime, DateTimeZone}
import play.api.libs.functional.syntax.{toFunctionalBuilderOps, unlift}
import play.api.libs.json.{JodaReads, JodaWrites, Json, __}

// TODO MRB: replace this with the simple Kinesis class once we migrate off SNS
class ThrallMessageSender(config: KinesisSenderConfig) {
  private val kinesis = new Kinesis(config)

  def publish(updateMessage: UpdateMessage): Unit = {
    kinesis.publish(updateMessage)
  }
}

case class BulkIndexRequest(
  bucket: String,
  key: String
)

object BulkIndexRequest {
  implicit val reads = Json.reads[BulkIndexRequest]
  implicit val writes = Json.writes[BulkIndexRequest]
}

object UpdateMessage extends GridLogging {
  implicit val yourJodaDateReads = JodaReads.DefaultJodaDateTimeReads.map(d => d.withZone(DateTimeZone.UTC))
  implicit val yourJodaDateWrites = JodaWrites.JodaDateTimeWrites
  implicit val unw = Json.writes[UsageNotice]
  implicit val unr = Json.reads[UsageNotice]
  implicit val writes = Json.writes[UpdateMessage]
  implicit val reads =
    (
      (__ \ "subject").read[String] ~
        (__ \ "image").readNullable[Image] ~
        (__ \ "id").readNullable[String] ~
        (__ \ "usageNotice").readNullable[UsageNotice] ~
        (__ \ "edits").readNullable[Edits] ~
        // We seem to get messages from _somewhere which don't have last modified on them.
        (__ \ "lastModified").readNullable[DateTime].map{ d => d match {
          case Some(date) => date
          case None => {
            logger.warn("Message received without a last modified date", __.toJsonString)
            DateTime.now(DateTimeZone.UTC)
          }
        }} ~
        (__ \ "collections").readNullable[Seq[Collection]] ~
        (__ \ "leaseId").readNullable[String] ~
        (__ \ "crops").readNullable[Seq[Crop]] ~
        (__ \ "mediaLease").readNullable[MediaLease] ~
        (__ \ "leases").readNullable[Seq[MediaLease]] ~
        (__ \ "syndicationRights").readNullable[SyndicationRights] ~
        (__ \ "bulkIndexRequest").readNullable[BulkIndexRequest]
    )(UpdateMessage.apply _)
}

// TODO add RequestID
case class UpdateMessage(
  subject: String,
  image: Option[Image] = None,
  id: Option[String] = None,
  usageNotice: Option[UsageNotice] = None,
  edits: Option[Edits] = None,
  lastModified: DateTime = DateTime.now(DateTimeZone.UTC),
  collections: Option[Seq[Collection]] = None,
  leaseId: Option[String] = None,
  crops: Option[Seq[Crop]] = None,
  mediaLease: Option[MediaLease] = None,
  leases: Option[Seq[MediaLease]] = None,
  syndicationRights: Option[SyndicationRights] = None,
  bulkIndexRequest: Option[BulkIndexRequest] = None
) extends LogMarker {
  override def markerContents = {
    val message = Json.stringify(Json.toJson(this))
    Map (
      "subject" -> subject,
      "id" -> id.getOrElse(image.map(_.id).getOrElse("none")),
      "size" -> message.getBytes.length,
      "length" -> message.length
    ) ++ image.map("fileName" -> _.source.file.toString)
  }
}
