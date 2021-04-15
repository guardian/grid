package lib

import com.gu.mediaservice.lib.aws.DynamoDB

class SyndicationStore(config: EditsConfig) extends DynamoDB(config, config.syndicationTable)
