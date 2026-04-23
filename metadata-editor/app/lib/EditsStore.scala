package lib

import com.amazonaws.services.dynamodbv2.AmazonDynamoDBAsync
import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.Edits
import software.amazon.awssdk.services.dynamodb.DynamoDbClient

class EditsStore(client: AmazonDynamoDBAsync, client2: DynamoDbClient, tableName: String) extends DynamoDB[Edits](client, client2, tableName, Some(Edits.LastModified))
