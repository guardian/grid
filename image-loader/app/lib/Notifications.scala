package lib

import com.gu.mediaservice.lib.aws.SNS

class Notifications(config: ImageLoaderConfig) extends SNS(config, config.topicArn)
