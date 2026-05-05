package com.gu.mediaservice.lib

import com.gu.mediaservice.lib.aws.S3
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.GridLogging
import org.apache.pekko.actor.{Cancellable, Scheduler}
import org.joda.time.DateTime

import java.io.InputStream
import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.ExecutionContext
import scala.concurrent.duration._
import scala.util.control.NonFatal


abstract class BaseStore[TStoreKey, TStoreVal](bucket: String, config: CommonConfig)(implicit ec: ExecutionContext)
  extends GridLogging {

  val s3 = new S3(config)

  protected val store: AtomicReference[Map[TStoreKey, TStoreVal]] = new AtomicReference(Map.empty)
  protected val lastUpdated: AtomicReference[DateTime] = new AtomicReference(DateTime.now())

  protected def getS3Object(key: String): Option[String] = s3.getObjectAsString(bucket, key)

  protected def getLatestS3Stream: Option[InputStream] = {
    val objects = s3.listObjects(bucket)
      .filterNot(_.key() == "AMAZON_SES_SETUP_NOTIFICATION")

    if (objects.nonEmpty) {
      val obj = objects.maxBy(_.lastModified())
      logger.info(s"Latest key ${obj.key()} in bucket $bucket")

      val stream = s3.getObject(bucket, obj.key())
      Some(stream)
    } else {
      logger.error(s"Bucket $bucket is empty")
      None
    }
  }

  private var cancellable: Option[Cancellable] = None

  def scheduleUpdates(scheduler: Scheduler): Unit = {
    cancellable = Some(scheduler.scheduleAtFixedRate(0.seconds, 10.minutes)(() => {
      try {
        update()
        lastUpdated.set(DateTime.now())
      } catch {
        case NonFatal(e) => logger.error("Store update failed", e)
      }
    }))
  }

  def stopUpdates(): Unit = {
    cancellable.foreach(_.cancel())
  }

  def update(): Unit
}
