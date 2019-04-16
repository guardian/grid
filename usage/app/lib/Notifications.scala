package lib

import com.gu.mediaservice.lib.aws.{ThrallMessageSender, SNS}

class Notifications(config: UsageConfig) extends ThrallMessageSender(config, config.topicArn)
