import com.amazonaws.services.cloudwatch.AmazonCloudWatchClientBuilder
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBAsyncClientBuilder
import com.amazonaws.services.kinesis.AmazonKinesisClientBuilder
import com.amazonaws.services.sns.AmazonSNSClientBuilder
import com.amazonaws.services.sqs.AmazonSQSClientBuilder
import com.gu.mediaservice.lib.aws.{Kinesis, MessageSender, SNS}
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.play.{GridAuthentication, GridComponents}
import controllers.{EditsApi, EditsController}
import lib._
import play.api.ApplicationLoader.Context
import router.Routes

class MetadataEditorComponents(context: Context) extends GridComponents(context) with GridAuthentication {
  val dynamoClient = AmazonDynamoDBAsyncClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val snsClient = AmazonSNSClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val sqsClient = AmazonSQSClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val kinesisClient = AmazonKinesisClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val cloudwatchClient = AmazonCloudWatchClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()

  val editsTable = config.get[String]("dynamo.table.edits")
  val snsTopicArn = config.get[String]("sns.topic.arn")
  val queueUrl = config.get[String]("indexed.images.sqs.queue.url")
  val thrallKinesisStream = config.get[String]("thrall.kinesis.stream")
  val cloudwatchMetricsNamespace = config.get[String]("cloudwatch.metrics.namespace")

  val store = new EditsStore(dynamoClient, editsTable)
  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val sns = new SNS(snsClient, snsTopicArn)
  val kinesis = new Kinesis(kinesisClient, thrallKinesisStream)
  val notifications = new MessageSender(sns, kinesis)

  val metrics = new MetadataEditorMetrics(cloudwatchMetricsNamespace, cloudwatchClient)
  val messageConsumer = new MetadataMessageConsumer(queueUrl, metrics, store, sqsClient)

  messageConsumer.startSchedule()
  context.lifecycle.addStopHook {
    () => messageConsumer.actorSystem.terminate()
  }

  val editsController = new EditsController(auth, services, store, notifications, controllerComponents)
  val controller = new EditsApi(auth, services, controllerComponents)

  override val router = new Routes(httpErrorHandler, controller, editsController, management)
}
