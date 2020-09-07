package lib

import com.gu.mediaservice.lib.aws.ThrallMessageSender

class Notifications(config: CropperConfig) extends ThrallMessageSender(config.thrallKinesisStreamConfig)
