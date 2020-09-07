package lib

import com.gu.mediaservice.lib.aws.ThrallMessageSender

class Notifications(config: UsageConfig) extends ThrallMessageSender(config.thrallKinesisStreamConfig)
