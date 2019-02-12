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
                         // TODO Syndication rights gets to have the data field because the sender renders the JSON shared with SNS
                         // at the top level and we can't separate them easily
                         data: Option[SyndicationRights] = None
                        )