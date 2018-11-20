package com.gu.mediaservice.lib

import java.io.InputStream
import java.util.concurrent.atomic.AtomicReference

import com.amazonaws.AmazonServiceException
import com.amazonaws.util.IOUtils
import com.gu.mediaservice.lib.aws.S3
import com.gu.mediaservice.lib.config.CommonConfig
import org.joda.time.DateTime
import org.slf4j.LoggerFactory

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext


abstract class BaseStore[TStoreKey, TStoreVal](bucket: String, config: CommonConfig)(implicit ec: ExecutionContext) extends Logging {
  val s3 = new S3(config)

  protected val store: AtomicReference[Map[TStoreKey, TStoreVal]] = new AtomicReference(Map.empty)
  protected val lastUpdated: AtomicReference[DateTime] = new AtomicReference(DateTime.now())

  protected def getS3Object(key: String): Option[String] = {
    val content = s3.client.getObject(bucket, key)
    val stream = content.getObjectContent
    try
      Some(IOUtils.toString(stream).trim)
    catch {
      case e: AmazonServiceException if e.getErrorCode == "NoSuchKey" =>
        Logger.warn(s"Cannot find key: $key in bucket: $bucket")
        None
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
}

