package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.libs.json.JsValue

// TODO MRB: replace this with the simple Kinesis class once we migrate off SNS
class MessageSender(config: CommonConfig, snsTopicArn: String) {
  private val legacySns = new SNS(config, snsTopicArn)
  private val kinesis = new Kinesis(config, config.thrallKinesisStream)

  def publish(message: JsValue, subject: String): Unit = {
    legacySns.publish(message, subject)
    kinesis.publish(message, subject)
  }
}
