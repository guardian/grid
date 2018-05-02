package lib

import com.gu.mediaservice.lib.aws.SNS

class Notifications(config: UsageConfig) extends SNS(config, config.topicArn)