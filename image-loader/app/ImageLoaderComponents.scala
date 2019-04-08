import java.io.File

import com.amazonaws.services.kinesis.AmazonKinesisClientBuilder
import com.amazonaws.services.sns.AmazonSNSClientBuilder
import com.gu.mediaservice.lib.aws.{Kinesis, MessageSender, SNS}
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.play.{GridAuthentication, GridComponents}
import controllers.ImageLoaderController
import lib._
import lib.storage.ImageLoaderStore
import model.{ImageUploadOps, OptimisedPngOps}
import play.api.ApplicationLoader.Context
import router.Routes

class ImageLoaderComponents(context: Context) extends GridComponents("image-loader", context) with GridAuthentication {
  val snsClient = AmazonSNSClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val kinesisClient = AmazonKinesisClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()

  val imageBucket = config.get[String]("s3.image.bucket")
  val thumbnailBucket = config.get[String]("s3.thumb.bucket")
  val snsTopicArn = config.get[String]("sns.topic.arn")
  val thrallKinesisStream = config.get[String]("thrall.kinesis.stream")

  val tempDir = new File(config.get[String]("upload.tmp.dir"))

  val thumbWidth: Int = 256
  val thumbQuality: Double = 85d // out of 100
  val supportedMimeTypes = Set("image/jpeg", "image/png")

  val store = new ImageLoaderStore(imageBucket, thumbnailBucket, s3Client)
  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val sns = new SNS(snsClient, snsTopicArn)
  val kinesis = new Kinesis(kinesisClient, thrallKinesisStream)
  val notifications = new MessageSender(sns, kinesis)

  val downloader = new Downloader()
  val optimisedPngOps = new OptimisedPngOps(store, tempDir)
  val imageUploadOps = new ImageUploadOps(store, imageOperations, optimisedPngOps, tempDir, thumbWidth, thumbQuality)

  val controller = new ImageLoaderController(auth, services, downloader, store, notifications, imageUploadOps, tempDir, supportedMimeTypes, controllerComponents, wsClient)

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
