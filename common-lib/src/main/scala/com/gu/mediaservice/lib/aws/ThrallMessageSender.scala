package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.MediaLease
import com.gu.mediaservice.model.usage.UsageNotice
import net.logstash.logback.marker.LogstashMarker
import org.joda.time.DateTime
import play.api.libs.json.{JodaWrites, Json}

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

object UpdateMessage {
  implicit val yourJodaDateWrites = JodaWrites.JodaDateTimeWrites
  implicit val unw = Json.writes[UsageNotice]
  implicit val writes = Json.writes[UpdateMessage]
}

// TODO add RequestID
case class UpdateMessage(
  subject: String,
  image: Option[Image] = None,
  id: Option[String] = None,
  usageNotice: Option[UsageNotice] = None,
  edits: Option[Edits] = None,
  lastModified: Option[DateTime] = None,
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
    )
  }
}
