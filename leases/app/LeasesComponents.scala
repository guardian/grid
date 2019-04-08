import com.amazonaws.services.dynamodbv2.AmazonDynamoDBAsyncClientBuilder
import com.amazonaws.services.kinesis.AmazonKinesisClientBuilder
import com.amazonaws.services.sns.AmazonSNSClientBuilder
import com.gu.mediaservice.lib.aws.{Kinesis, MessageSender, SNS}
import com.gu.mediaservice.lib.play.{GridAuthentication, GridComponents}
import controllers.MediaLeaseController
import lib.{LeaseNotifier, LeaseStore}
import play.api.ApplicationLoader.Context
import router.Routes

class LeasesComponents(context: Context) extends GridComponents("leases", context) with GridAuthentication {
  val dynamoClient = AmazonDynamoDBAsyncClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val snsClient = AmazonSNSClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val kinesisClient = AmazonKinesisClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()

  val leasesTable = config.get[String]("dynamo.tablename.leasesTable")
  val snsTopicArn = config.get[String]("sns.topic.arn")
  val thrallKinesisStream = config.get[String]("thrall.kinesis.stream")

  val sns = new SNS(snsClient, snsTopicArn)
  val kinesis = new Kinesis(kinesisClient, thrallKinesisStream)
  val messageSender = new MessageSender(sns, kinesis)

  val store = new LeaseStore(dynamoClient, leasesTable)
  val notifications = new LeaseNotifier(store, messageSender)

  val controller = new MediaLeaseController(auth, store, services, notifications, controllerComponents)
  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
