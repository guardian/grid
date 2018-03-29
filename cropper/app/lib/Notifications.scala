package lib

import com.gu.mediaservice.lib.aws.SNS

class Notifications(config: CropperConfig) extends SNS(config, config.topicArn)
