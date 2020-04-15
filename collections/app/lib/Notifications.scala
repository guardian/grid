package lib

import com.gu.mediaservice.lib.aws.ThrallMessageSender

class Notifications(config: CollectionsConfig) extends ThrallMessageSender(config.thrallKinesisStreamConfig)
