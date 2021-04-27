package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.SyndicationRights

class SyndicationStore(config: EditsConfig) extends DynamoDB[SyndicationRights](config, config.syndicationTable)
