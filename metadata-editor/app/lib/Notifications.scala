package lib

import com.gu.mediaservice.lib.aws.SNS

class Notifications(config: EditsConfig) extends SNS(config, config.topicArn)
