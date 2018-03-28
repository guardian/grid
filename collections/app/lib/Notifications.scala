package lib

import com.gu.mediaservice.lib.aws.SNS

class Notifications(config: CollectionsConfig) extends SNS(config.awsCredentials, config.topicArn)
