package lib

import com.gu.mediaservice.lib.aws.SNS

class Notifications(config: MediaApiConfig) extends SNS(config, config.topicArn)
