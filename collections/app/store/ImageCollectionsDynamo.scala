package store

import com.gu.mediaservice.lib.aws.DynamoDB
import lib.Config

trait ImageCollectionsDynamo {
  val dynamo = new DynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.imageCollectionsTable)
}

