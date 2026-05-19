import com.amazonaws.services.dynamodbv2.AmazonDynamoDBAsyncClientBuilder
import com.gu.mediaservice.lib.management.InnerServiceStatusCheckController
import com.gu.mediaservice.lib.play.GridComponents
import controllers.{EditsApi, EditsController, SyndicationController}
import lib._
import play.api.ApplicationLoader.Context
import router.Routes
import software.amazon.awssdk.services.dynamodb.DynamoDbClient

class MetadataEditorComponents(context: Context) extends GridComponents(context, new EditsConfig(_)) {
  final override val buildInfo = utils.buildinfo.BuildInfo

  val editsStore = new EditsStore(config.withAWSCredentials(AmazonDynamoDBAsyncClientBuilder.standard()).build(),
    config.withAWSCredentialsV2(DynamoDbClient.builder()).build(), config.editsTable)
  val syndicationStore = new SyndicationStore(
    config.withAWSCredentials(AmazonDynamoDBAsyncClientBuilder.standard()).build(),
    config.withAWSCredentialsV2(DynamoDbClient.builder()).build(),
    config.syndicationTable
  )
  val notifications = new Notifications(config)

  val metrics = new MetadataEditorMetrics(config, actorSystem, applicationLifecycle)
  val messageConsumer = new MetadataSqsMessageConsumer(config, metrics, editsStore)

  messageConsumer.startSchedule()
  context.lifecycle.addStopHook {
    () => messageConsumer.actorSystem.terminate()
  }

  val editsController = new EditsController(auth, editsStore, notifications, config, wsClient, authorisation, controllerComponents)
  val syndicationController = new SyndicationController(auth, editsStore, syndicationStore, notifications, config, controllerComponents)
  val controller = new EditsApi(auth, config, authorisation, controllerComponents)
  val InnerServiceStatusCheckController = new InnerServiceStatusCheckController(auth, controllerComponents, config.services, wsClient)



  override val router = new Routes(httpErrorHandler, controller, editsController, syndicationController, management, InnerServiceStatusCheckController)
}

