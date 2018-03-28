package com.gu.mediaservice.lib

import java.io.InputStream

import _root_.play.api.Logger
import _root_.play.api.libs.concurrent.Execution.Implicits._
import akka.actor.Scheduler
import com.amazonaws.AmazonServiceException
import com.amazonaws.auth.AWSCredentials
import com.amazonaws.util.IOUtils
import com.gu.Box
import com.gu.mediaservice.lib.aws.S3
import org.joda.time.DateTime
import org.slf4j.LoggerFactory

import scala.collection.JavaConverters._
import scala.concurrent.duration._


abstract class BaseStore[TStoreKey, TStoreVal](bucket: String, credentials: AWSCredentials) {
  val s3 = new S3(credentials)

  private val log = LoggerFactory.getLogger(getClass)

  protected val store: Box[Map[TStoreKey, TStoreVal]] = Box(Map.empty)
  protected val lastUpdated: Box[DateTime] = Box(DateTime.now())

  protected def getS3Object(key: String): Option[String] = {
    val content = s3.client.getObject(bucket, key)
    val stream = content.getObjectContent
    try
      Some(IOUtils.toString(stream).trim)
    catch {
      case e: AmazonServiceException if e.getErrorCode == "NoSuchKey" => {
        log.warn(s"Cannot find key: $key in bucket: $bucket")
        None
      }
    }
    finally
      stream.close()
  }

  protected def getLatestS3Stream: Option[InputStream] = {
    val objects = s3.client
      .listObjects(bucket).getObjectSummaries.asScala
      .filterNot(_.getKey == "AMAZON_SES_SETUP_NOTIFICATION")

    if (objects.nonEmpty) {
      val obj = objects.maxBy(_.getLastModified)
      Logger.info(s"Latest key ${obj.getKey} in bucket $bucket")

      val stream = s3.client.getObject(bucket, obj.getKey).getObjectContent
      Some(stream)
    } else {
      Logger.error(s"Bucket $bucket is empty")
      None
    }
  }

  def scheduleUpdates(scheduler: Scheduler) {
    scheduler.schedule(0.seconds, 10.minutes)(update())
  }

  def update(): Unit
}

