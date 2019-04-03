import com.amazonaws.services.dynamodbv2.AmazonDynamoDBAsyncClientBuilder
import com.amazonaws.services.kinesis.AmazonKinesisClientBuilder
import com.amazonaws.services.sns.AmazonSNSClientBuilder
import com.gu.mediaservice.lib.aws.{DynamoDB, Kinesis, MessageSender, SNS}
import com.gu.mediaservice.lib.play.{GridAuthentication, GridComponents}
import controllers.{CollectionsController, ImageCollectionsController}
import play.api.ApplicationLoader.Context
import router.Routes
import store.CollectionsStore

class CollectionsComponents(context: Context) extends GridComponents(context) with GridAuthentication {
  val dynamoClient = AmazonDynamoDBAsyncClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val snsClient = AmazonSNSClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val kinesisClient = AmazonKinesisClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()

  val collectionsTable = config.get[String]("dynamo.table.collections")
  val snsTopicArn = config.get[String]("sns.topic.arn")
  val thrallKinesisStream = config.get[String]("thrall.kinesis.stream")

  val sns = new SNS(snsClient, snsTopicArn)
  val kinesis = new Kinesis(kinesisClient, thrallKinesisStream)

  val store = new CollectionsStore(new DynamoDB(dynamoClient, collectionsTable))
  // TODO MRB: are the collection metrics (deleted here) valuable?
  val notifications = new MessageSender(sns, kinesis)

  val collections = new CollectionsController(auth, config, store, controllerComponents)
  val imageCollections = new ImageCollectionsController(auth, config, notifications, controllerComponents)

  override val router = new Routes(httpErrorHandler, collections, imageCollections, management)
}
