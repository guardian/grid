package lib

import java.nio.ByteBuffer

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

  def publish(operation: String, data: JsValue): Unit = {
    val imageId = data \ "id"
    val userEmail = data \ "userEmail"

    val thriftStruct = Notification(
      app = App.MediaServices,
      operation = operation,
      userEmail = userEmail.toString(),
      date = new DateTime().toString(),
      resourceId = Some(imageId.toString()),
      message = Some(s"$userEmail deleted image with ID: $imageId")
    )
    val thriftAsByteBuffer = ByteBuffer.wrap(ThriftSerializer.serializeToBytes(thriftStruct, false))
    client.putRecord(Config.auditingStreamName, thriftAsByteBuffer, "media-service-updates")
  }

}

object ThriftSerializer {

  val ThriftBufferInitialSize = 128

  def serializeToBytes(struct: ThriftStruct, includeCompressionFlag: Boolean): Array[Byte] = {
    val buffer = new TMemoryBuffer(ThriftBufferInitialSize)
    val protocol = new TCompactProtocol(buffer)
    struct.write(protocol)

    includeCompressionFlag match {
      case true => compressionByte +: buffer.getArray
      case false => buffer.getArray
    }
  }

  val compressionByte: Byte = {
    0x00.toByte
  }

}
