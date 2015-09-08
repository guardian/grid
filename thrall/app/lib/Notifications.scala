package lib

import com.gu.mediaservice.lib.aws.SNS

object ImageIndexedNotifications extends SNS(Config.awsCredentials, Config.imageIndexedTopicArn)
