package lib

import com.gu.mediaservice.lib.aws.SNS

class MetadataNotifications(config: ThrallConfig) extends SNS(config, config.metadataTopicArn)
