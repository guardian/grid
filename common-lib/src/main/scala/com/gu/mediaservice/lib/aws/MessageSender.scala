package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.usage.UsageNotice
import org.joda.time.DateTime
import play.api.libs.json.JsValue

// TODO MRB: replace this with the simple Kinesis class once we migrate off SNS
class MessageSender(config: CommonConfig, snsTopicArn: String) {
  private val legacySns = new SNS(config, snsTopicArn)
  private val kinesis = new Kinesis(config, config.thrallKinesisStream)

  // TODO deprecate the message JsValue input in favour of the more structured update message
  def publish(message: JsValue, subject: String, updateMessage: UpdateMessage): Unit = {
    legacySns.publish(message, subject)
    kinesis.publish(updateMessage)
  }
}

case class UpdateMessage(subject: String,
                         id: String,
                         image: Option[Image] = None,
                         usageNotice: Option[UsageNotice] = None,
                         edits: Option[Edits] = None,
                         lastModified: Option[DateTime] = None,
                         collections: Option[Seq[Collection]] = None,
                         leaseId: Option[String] = None,
                         crops: Option[Seq[Crop]] = None,
                         mediaLease: Option[MediaLease] = None,
                         leases: Option[Seq[MediaLease]] = None,
                         syndicationRights: Option[SyndicationRights] = None
                        )
