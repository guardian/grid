package lib

import com.amazonaws.services.sns.AmazonSNS
import com.gu.mediaservice.lib.aws.SNS

class MetadataNotifications(metadataTopicArn: String, client: AmazonSNS) extends SNS(client, metadataTopicArn)
