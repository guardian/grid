package lib

import com.gu.mediaservice.lib.aws.SNS

class ThrallNotifications(config: ThrallConfig) extends SNS(config, config.topicArn)
