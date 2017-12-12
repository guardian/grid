package lib

import java.nio.ByteBuffer

import com.amazonaws.services.kinesis.model.PutRecordRequest
import com.gu.thrift.serializer.ThriftSerializer
import com.amazonaws.auth.STSAssumeRoleSessionCredentialsProvider
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.regions.{Region, Regions}
import com.amazonaws.services.kinesis.AmazonKinesisClient
import com.gu.auditing.model.v1.{App, Notification}
import com.gu.mediaservice.lib.aws.SNS
import com.twitter.scrooge.ThriftStruct
import org.apache.thrift.protocol.TCompactProtocol
import org.apache.thrift.transport.TMemoryBuffer
import org.joda.time.DateTime
import play.api.libs.json.JsValue

object DynamoNotifications extends SNS(Config.awsCredentials, Config.dynamoTopicArn)


object Auditing {
  private lazy val auditingCredentialsProvider = Config.auditingKinesisWriteRole.map(new STSAssumeRoleSessionCredentialsProvider(_, "media-service"))

  val region =  Region getRegion Regions.EU_WEST_1
  val client = region.createClient(classOf[AmazonKinesisClient], auditingCredentialsProvider.getOrElse(new ProfileCredentialsProvider("cmsFronts")), null)
  val partitionKey = "media-service-updates"

  def publish(operation: String, data: JsValue): Unit = {
    val imageId = data \ "id"
    val userEmail = data \ "userEmail"
    val dateTime = new DateTime()
    val thriftStruct = Notification(
      app = App.MediaServices,
      operation = operation,
      userEmail = userEmail.toString(),
      date = dateTime.toString,
      resourceId = Some(imageId.toString()),
      message = Some(s"$userEmail deleted image with ID: $imageId"),
      expiryDate = Some(dateTime.plusMonths(1).toString)
    )

    client.putRecord(
      new PutRecordRequest()
        .withData(ByteBuffer.wrap(ThriftSerialize.serializeNotification(thriftStruct)))
        .withStreamName(Config.auditingStreamName)
        .withPartitionKey(partitionKey)
    )
  }

}

object ThriftSerialize extends ThriftSerializer {
  def serializeNotification(notification: Notification): Array[Byte] = {
    serializeToBytes(notification)
  }
}
