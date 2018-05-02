package lib

import com.gu.mediaservice.lib.aws.DynamoDB

class EditsStore(config: EditsConfig) extends DynamoDB(config, config.editsTable)
