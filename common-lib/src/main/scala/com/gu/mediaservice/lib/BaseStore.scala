package com.gu.mediaservice.lib

import org.joda.time.DateTime

import akka.actor.Scheduler
import akka.agent.Agent

import scala.concurrent.duration._

import org.slf4j.LoggerFactory

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.AmazonServiceException

import org.apache.commons.io.IOUtils

import _root_.play.api.libs.json._
import _root_.play.api.libs.functional.syntax._
import _root_.play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.lib.aws.S3


abstract class BaseStore[TStoreKey, TStoreVal](bucket: String, credentials: AWSCredentials) {
  val s3 = new S3(credentials)

  private val log = LoggerFactory.getLogger(getClass)

  protected val store: Agent[Map[TStoreKey, TStoreVal]] = Agent(Map.empty)
  protected val lastUpdated: Agent[DateTime] = Agent(DateTime.now())

  protected def getS3Object(key: String): Option[String] = {
    val content = s3.client.getObject(bucket, key)
    val stream = content.getObjectContent
    try
      Some(IOUtils.toString(stream, "utf-8").trim)
    catch {
      case e: AmazonServiceException if e.getErrorCode == "NoSuchKey" => {
        log.warn(s"Cannot find key: $key in bucket: $bucket")
        None
      }
    }
    finally
      stream.close()
  }

  def scheduleUpdates(scheduler: Scheduler) {
    scheduler.schedule(0.seconds, 10.minutes)(update())
  }

  def update(): Unit
}


