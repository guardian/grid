package lib

import com.gu.mediaservice.lib.aws.MessageSender

class Notifications(config: CropperConfig) extends MessageSender(config, config.topicArn)
