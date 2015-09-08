package lib

import com.gu.mediaservice.lib.aws.SNS

object DynamoNotifications extends SNS(Config.awsCredentials, Config.dynamoTopicArn)
