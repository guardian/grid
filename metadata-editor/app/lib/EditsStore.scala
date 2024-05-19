package lib

import com.gu.mediaservice.lib.aws.{DynamoDB, InstanceAwareDynamoDB}
import com.gu.mediaservice.model.Edits

class EditsStore(config: EditsConfig) extends InstanceAwareDynamoDB[Edits](config, config.editsTable, Some(Edits.LastModified))
