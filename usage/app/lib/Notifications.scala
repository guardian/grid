package lib

import com.gu.mediaservice.lib.aws.{MessageSender, SNS}

class Notifications(config: UsageConfig) extends MessageSender(config, config.topicArn)