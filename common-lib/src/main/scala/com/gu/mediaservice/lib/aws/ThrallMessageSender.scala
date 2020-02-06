package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.MediaLease
import com.gu.mediaservice.model.usage.UsageNotice
import net.logstash.logback.marker.{LogstashMarker, Markers}
import org.joda.time.DateTime
import play.api.libs.json._
import play.api.libs.functional.syntax._

import scala.collection.JavaConverters._

// TODO MRB: replace this with the simple Kinesis class once we migrate off SNS
class ThrallMessageSender(config: CommonConfig) {
  private val kinesis = new Kinesis(config)

  def publish(message: ThrallMessage): Unit = kinesis.publish(message)
}

object ThrallMessage {
  implicit val dateWrites = JodaWrites.JodaDateTimeWrites
  implicit val dateReads = JodaReads.DefaultJodaDateTimeReads
  implicit val usageReads = Json.reads[UsageNotice]
  implicit val usageWrites = Json.writes[UsageNotice]

  implicit val messageReads: Reads[ThrallMessage] = {
    val updateMsg = Json.reads[UpdateMessage]
    val reindexMsg = Json.reads[ThrallMessage.ReindexImage]
    __.read[UpdateMessage](updateMsg).map(x => x: UpdateMessage) |
      __.read[ThrallMessage.ReindexImage](reindexMsg).map(x => x: ThrallMessage.ReindexImage)
  }

  implicit val messageWrites: Writes[ThrallMessage] = Writes[ThrallMessage] {
    case msg: UpdateMessage => Json.writes[UpdateMessage].writes(msg)
    case msg: ThrallMessage.ReindexImage => Json.writes[ThrallMessage.ReindexImage].writes(msg)
  }

  final case class ReindexImage(id: String, image: String) extends ThrallMessage {
    override def getId: String = id
    val subject = "reindex-image"
  }
}

// TODO add RequestID

sealed abstract class ThrallMessage extends Product with Serializable {
  def getId: String
  val subject: String

  def toLogMarker: LogstashMarker = {
    val message = Json.stringify(Json.toJson(this))

    val markers = Map (
      "subject" -> subject,
      "id" -> getId,
      "size" -> message.getBytes.length,
      "length" -> message.length
    )

    Markers.appendEntries(markers.asJava)
  }
}

/**
  * @todo We'd like to translate this class, which has properties for all of the
  *       possible messages that we can send, into case classes that represent each
  *       message discretely -- see, for example, ThrallMessage.ReindexImage above.
  *       This should ensure type safety at the point at which we deserialise the message.
  */
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
) extends ThrallMessage {
  override def getId: String = id.getOrElse(image.map(_.id).getOrElse("none"))

  override def toLogMarker: LogstashMarker = {
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
