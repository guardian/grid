package lib

import com.gu.mediaservice.lib.aws.SNS

class DynamoNotifications(config: ThrallConfig) extends SNS(config, config.dynamoTopicArn)
