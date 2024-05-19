package lib

import com.gu.mediaservice.lib.aws.{DynamoDB, InstanceAwareDynamoDB}
import com.gu.mediaservice.model.SyndicationRights

class SyndicationStore(config: EditsConfig) extends InstanceAwareDynamoDB[SyndicationRights](config, config.syndicationTable)
