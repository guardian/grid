package com.gu.mediaservice.lib.auth

import scala.collection.JavaConverters._
import scala.concurrent.Future
import scala.concurrent.duration._

import akka.actor.Scheduler
import akka.agent.Agent

import play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.lib.aws.S3
import com.amazonaws.auth.AWSCredentials
import org.apache.commons.io.IOUtils
import com.amazonaws.AmazonServiceException

class KeyStore(bucket: String, credentials: AWSCredentials) {

  val s3 = new S3(credentials)

  def lookupIdentity(key: String): Future[Option[String]] =
    store.future.map(_.get(key))

  def findKey(prefix: String): Option[String] = s3.syncFindKey(bucket, prefix)

  private val store: Agent[Map[String, String]] = Agent(Map.empty)

  def scheduleUpdates(scheduler: Scheduler) {
    scheduler.schedule(0.seconds, 10.minutes)(update())
  }

  def update() {
    store.sendOff(_ => fetchAll)
  }

  private def fetchAll: Map[String, String] = {
    val keys = s3.client.listObjects(bucket).getObjectSummaries.asScala.map(_.getKey)
    keys.flatMap(k => getIdentity(k).map(k -> _)).toMap
  }

  private def getIdentity(key: String): Option[String] = {
    val content = s3.client.getObject(bucket, key)
    val stream = content.getObjectContent
    try
      Some(IOUtils.toString(stream, "utf-8"))
    catch {
      case e: AmazonServiceException if e.getErrorCode == "NoSuchKey" => None
    }
    finally
      stream.close()
  }
}
