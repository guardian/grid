package lib

import com.gu.mediaservice.lib.aws.ThrallMessageSender

class Notifications(config: EditsConfig) extends ThrallMessageSender(config.thrallKinesisStreamConfig)
