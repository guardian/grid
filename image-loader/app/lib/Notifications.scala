package lib

import com.gu.mediaservice.lib.aws.MessageSender

class Notifications(config: ImageLoaderConfig) extends MessageSender(config, config.topicArn)
