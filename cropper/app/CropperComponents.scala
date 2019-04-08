import java.io.File

import com.amazonaws.services.kinesis.AmazonKinesisClientBuilder
import com.amazonaws.services.sns.AmazonSNSClientBuilder
import com.gu.mediaservice.lib.auth.PermissionsHandler
import com.gu.mediaservice.lib.aws.{Kinesis, MessageSender, SNS}
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.management.ManagementWithPermissions
import com.gu.mediaservice.lib.play.{GridAuthentication, GridComponents}
import controllers.CropperController
import lib.{CropStore, Crops}
import model.CropSizes
import play.api.ApplicationLoader.Context
import router.Routes

class CropperComponents(context: Context) extends GridComponents("cropper", context) with GridAuthentication {
  val snsClient = AmazonSNSClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val kinesisClient = AmazonKinesisClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()

  val imgPublishingBucket = config.get[String]("publishing.image.bucket")
  val imgPublishingHost = config.getOptional[String]("publishing.image.host")
  val snsTopicArn = config.get[String]("sns.topic.arn")
  val thrallKinesisStream = config.get[String]("thrall.kinesis.stream")
  val permissionStage = config.get[String]("permissions.stage")

  val tempDir = new File(config.get[String]("crop.output.tmp.dir"))
  val cropSizes = CropSizes(
    landscapeWidths = List(2000, 1000, 500, 140),
    portraitHeights = List(2000, 1000, 500)
  )

  val store = new CropStore(imgPublishingBucket, imgPublishingHost, s3Client)
  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val crops = new Crops(cropSizes, store, tempDir, imageOperations)

  val sns = new SNS(snsClient, snsTopicArn)
  val kinesis = new Kinesis(kinesisClient, thrallKinesisStream)
  val notifications = new MessageSender(sns, kinesis)

  val permissionsHandler = new PermissionsHandler(permissionStage, region, awsCredentials)

  val controller = new CropperController(auth, services, permissionsHandler, crops, store, notifications, controllerComponents, wsClient)
  // TODO: refactor into common base usage?
  val permissionsAwareManagement = new ManagementWithPermissions(controllerComponents, permissionsHandler)

  override lazy val router = new Routes(httpErrorHandler, controller, permissionsAwareManagement)
}
