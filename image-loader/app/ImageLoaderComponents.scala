import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.aws.SimpleSqsMessageConsumer
import com.gu.mediaservice.lib.events.UsageEvents
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.lib.play.GridComponents
import controllers.{ImageLoaderController, ImageLoaderManagement, UploadStatusController}
import lib._
import lib.storage.{ImageLoaderStore, QuarantineStore}
import model.{Projector, QuarantineUploader, Uploader}
import play.api.ApplicationLoader.Context
import router.Routes
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest

class ImageLoaderComponents(context: Context) extends GridComponents(context, new ImageLoaderConfig(_)) with GridLogging {
  final override val buildInfo = utils.buildinfo.BuildInfo

  private val imageProcessor = config.imageProcessor(applicationLifecycle)
  logger.info(s"Loaded ${imageProcessor.processors.size} image processors:")
  imageProcessor.processors.zipWithIndex.foreach { case (processor, index) =>
    logger.info(s" $index -> ${processor.description}")
  }

  val store = new ImageLoaderStore(config)
  val maybeIngestQueue = config.maybeIngestSqsQueueUrl.map(queueUrl => new SimpleSqsMessageConsumer(queueUrl, config))
  val uploadStatusTable = new UploadStatusTable(config)
  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)
  val notifications = new Notifications(config)
  val downloader = new Downloader()(ec,wsClient)
  val uploader = new Uploader(store, config, imageOperations, notifications, imageProcessor)
  val projector = Projector(config, imageOperations, imageProcessor, auth)
  val quarantineUploader: Option[QuarantineUploader] = (config.uploadToQuarantineEnabled, config.quarantineBucket) match {
    case (true, Some(bucketName)) =>{
      val quarantineStore = new QuarantineStore(config)
      Some(new QuarantineUploader(quarantineStore, config))
    }
    case (true, None) => throw new IllegalArgumentException(s"Quarantining is enabled. upload.quarantine.enabled = ${config.uploadToQuarantineEnabled} but no bucket is configured. s3.quarantine.bucket isn't configured.")
    case (false, _) => None
  }

  private val gridClient = GridClient(config.services)(wsClient)

  private val sqsClient: SqsClient = SqsClient.builder()
    .region(Region.EU_WEST_1)
    .build()

  private val usageEventsQueueUrl: String = {
    val getQueueRequest = GetQueueUrlRequest.builder()
      .queueName(config.usageEventsQueueName)
      .build()
    sqsClient.getQueueUrl(getQueueRequest).queueUrl
  }

  val events = new UsageEvents(actorSystem, applicationLifecycle, sqsClient, usageEventsQueueUrl)
  val metrics = new ImageLoaderMetrics(config, actorSystem, applicationLifecycle)

  val controller = new ImageLoaderController(
    auth, downloader, store, maybeIngestQueue, uploadStatusTable, config, uploader, quarantineUploader, projector, controllerComponents, gridClient, authorisation, metrics, events, wsClient)
  val uploadStatusController = new UploadStatusController(auth, uploadStatusTable, config, controllerComponents, authorisation)
  val imageLoaderManagement = new ImageLoaderManagement(controllerComponents, buildInfo, controller.maybeIngestQueueAndProcessor)

  override lazy val router = new Routes(httpErrorHandler, controller, uploadStatusController, imageLoaderManagement)
}
