package com.gu.mediaservice.lib.aws

import java.nio.ByteBuffer

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.MediaLease
import com.gu.mediaservice.model.usage.UsageNotice
import net.logstash.logback.marker.{LogstashMarker, Markers}
import org.joda.time.DateTime
import play.api.libs.json.{JodaWrites, Json}

import scala.collection.JavaConverters._

// TODO MRB: replace this with the simple Kinesis class once we migrate off SNS
class ThrallMessageSender(config: CommonConfig) {
  private val kinesis = new Kinesis(config, config.thrallKinesisStream)

  def publish(updateMessage: UpdateMessage): Unit = {
    kinesis.publish(updateMessage)
  }
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
  syndicationRights: Option[SyndicationRights] = None
) {
  def toLogMarker: LogstashMarker = {
    val message = Json.stringify(Json.toJson(this))

    val markers = Map (
      "subject" -> subject,
      "id" -> id.getOrElse(image.map(_.id).getOrElse("none")),
      "size" -> message.getBytes.length,
      "length" -> message.length
    )

    Markers.appendEntries(markers.asJava)
  }
}
