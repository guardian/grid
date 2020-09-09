package lib

import com.gu.mediaservice.lib.aws.ThrallMessageSender

class Notifications(config: ImageLoaderConfig) extends ThrallMessageSender(config.thrallKinesisStreamConfig)
