package com.gu.thrall.clients

import com.gu.mediaservice.lib.aws.SNS
import com.gu.thrall.config.ThrallLambdaConfig

class DynamoNotifications(config: ThrallLambdaConfig, dynamoTopicArn:String) extends SNS(config, dynamoTopicArn)

