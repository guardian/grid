package lib

import com.gu.mediaservice.lib.aws.SNS

object ImageUploadNotifications extends SNS(Config.awsCredentials, Config.imageIndexedTopicArn)
