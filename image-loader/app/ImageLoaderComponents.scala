import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.lib.play.GridComponents
import controllers.{ImageLoaderController, UploadStatusController}
import lib._
import lib.storage.{ImageLoaderStore, QuarantineStore}
import model.{Projector, Uploader, QuarantineUploader}
import play.api.ApplicationLoader.Context
import router.Routes

class ImageLoaderComponents(context: Context) extends GridComponents(context, new ImageLoaderConfig(_)) with GridLogging {
  final override val buildInfo = utils.buildinfo.BuildInfo

  logger.info(s"Loaded ${config.imageProcessor.processors.size} image processors:")
  config.imageProcessor.processors.zipWithIndex.foreach { case (processor, index) =>
    logger.info(s" $index -> ${processor.description}")
  }

  val store = new ImageLoaderStore(config)
  val uploadStatusTable = new UploadStatusTable(config)
  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)
  val notifications = new Notifications(config)
  val downloader = new Downloader()
  val uploader = new Uploader(store, config, imageOperations, notifications)
  val projector = Projector(config, imageOperations)
  val quarantineUploader: Option[QuarantineUploader] = (config.uploadToQuarantineEnabled, config.quarantineBucket) match {
    case (true, Some(bucketName)) =>{
      val quarantineStore = new QuarantineStore(config)
      Some(new QuarantineUploader(quarantineStore, config))
    }
    case (true, None) => throw new IllegalArgumentException(s"Quarantining is enabled. upload.quarantine.enabled = ${config.uploadToQuarantineEnabled} but no bucket is configured. s3.quarantine.bucket isn't configured.")
    case (false, _) => None
  }
  val controller = new ImageLoaderController(
    auth, downloader, store, uploadStatusTable, notifications, config, uploader, quarantineUploader, projector, controllerComponents, wsClient)
  val uploadStatusController = new UploadStatusController(auth, uploadStatusTable, controllerComponents)

  override lazy val router = new Routes(httpErrorHandler, controller, uploadStatusController, management)
}
