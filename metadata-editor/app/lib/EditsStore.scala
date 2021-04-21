package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.Edits

class EditsStore(config: EditsConfig) extends DynamoDB[Edits](config, config.editsTable, Some(Edits.LastModified))
