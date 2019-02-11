package lib

import com.gu.mediaservice.lib.aws.MessageSender

class Notifications(config: CollectionsConfig) extends MessageSender(config, config.topicArn)
