package lib

import com.amazonaws.services.dynamodbv2.AmazonDynamoDBAsync
import com.gu.mediaservice.lib.aws.DynamoDB

class EditsStore(client: AmazonDynamoDBAsync, editsTable: String) extends DynamoDB(client, editsTable)
