import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.aws.{Bedrock, S3Vectors, SimpleSqsMessageConsumer, Embedder}
import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.lib.management.InnerServiceStatusCheckController
import com.gu.mediaservice.lib.play.GridComponents
import controllers.{ImageLoaderController, ImageLoaderManagement, UploadStatusController}
import lib._
import lib.storage.{ImageLoaderStore, QuarantineStore}
import model.{Projector, QuarantineUploader, Uploader}
import play.api.ApplicationLoader.Context
import router.Routes

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

  val embedder: Option[Embedder] = if (config.shouldEmbed) Some(new Embedder(new S3Vectors(config), new Bedrock(config))) else None

  val uploader = new Uploader(store, config, imageOperations, notifications, embedder, imageProcessor)
  val projector = Projector(config, imageOperations, imageProcessor, auth, embedder)
  val quarantineUploader: Option[QuarantineUploader] = (config.uploadToQuarantineEnabled, config.quarantineBucket) match {
    case (true, Some(bucketName)) =>{
      val quarantineStore = new QuarantineStore(config)
      Some(new QuarantineUploader(quarantineStore, config))
    }
    case (true, None) => throw new IllegalArgumentException(s"Quarantining is enabled. upload.quarantine.enabled = ${config.uploadToQuarantineEnabled} but no bucket is configured. s3.quarantine.bucket isn't configured.")
    case (false, _) => None
  }

  val services = new Services(config.domainRoot, config.serviceHosts, Set.empty)
  private val gridClient = GridClient(services)(wsClient)

  val metrics = new ImageLoaderMetrics(config, actorSystem, applicationLifecycle)

  val controller = new ImageLoaderController(
    auth, downloader, store, maybeIngestQueue, uploadStatusTable, notifications, config, uploader, quarantineUploader, projector, controllerComponents, gridClient, authorisation, metrics)
  val uploadStatusController = new UploadStatusController(auth, uploadStatusTable, config, controllerComponents, authorisation)
  val InnerServiceStatusCheckController = new InnerServiceStatusCheckController(auth, controllerComponents, config.services, wsClient)
  val imageLoaderManagement = new ImageLoaderManagement(controllerComponents, buildInfo, controller.maybeIngestQueueAndProcessor)

  override lazy val router = new Routes(httpErrorHandler, controller, uploadStatusController, imageLoaderManagement, InnerServiceStatusCheckController)
}
