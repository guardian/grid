package com.gu.mediaservice.lib

import java.io.InputStream

import akka.actor.Scheduler
import com.gu.Box
import com.gu.mediaservice.lib.aws.S3
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.GridLogging
import org.joda.time.DateTime
import org.slf4j.LoggerFactory

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext
import scala.concurrent.duration._


abstract class BaseStore[TStoreKey, TStoreVal](bucket: String, config: CommonConfig)(implicit ec: ExecutionContext)
  extends GridLogging {

  val s3 = new S3(config)

  protected val store: Box[Map[TStoreKey, TStoreVal]] = Box(Map.empty)
  protected val lastUpdated: Box[DateTime] = Box(DateTime.now())

  protected def getS3Object(key: String): Option[String] = s3.getObjectAsString(bucket, key)

  protected def getLatestS3Stream: Option[InputStream] = {
    val objects = s3.client
      .listObjects(bucket).getObjectSummaries.asScala
      .filterNot(_.getKey == "AMAZON_SES_SETUP_NOTIFICATION")

    if (objects.nonEmpty) {
      val obj = objects.maxBy(_.getLastModified)
      logger.info(s"Latest key ${obj.getKey} in bucket $bucket")

      val stream = s3.client.getObject(bucket, obj.getKey).getObjectContent
      Some(stream)
    } else {
      logger.error(s"Bucket $bucket is empty")
      None
    }
  }

  def scheduleUpdates(scheduler: Scheduler) {
    scheduler.schedule(0.seconds, 10.minutes)(update())
  }

  def update(): Unit
}

