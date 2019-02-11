package lib

import com.gu.mediaservice.lib.aws.MessageSender

class Notifications(config: EditsConfig) extends MessageSender(config, config.topicArn)
