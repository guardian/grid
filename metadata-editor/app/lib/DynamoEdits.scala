package lib

import com.gu.mediaservice.lib.aws.DynamoDB

trait DynamoEdits {
  val dynamo = new DynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.editsTable)
}

