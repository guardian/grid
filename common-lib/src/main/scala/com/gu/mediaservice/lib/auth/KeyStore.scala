package com.gu.mediaservice.lib.auth

import scala.concurrent.Future
import scala.collection.JavaConverters._

import com.amazonaws.auth.AWSCredentials

import org.joda.time.DateTime

import play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.lib.BaseStore


class KeyStore(bucket: String, credentials: AWSCredentials) extends BaseStore[String, String](bucket, credentials) {
  def lookupIdentity(key: String): Future[Option[String]] =
    store.future.map(_.get(key))

  def findKey(prefix: String): Option[String] = s3.syncFindKey(bucket, prefix)

  def update() {
    lastUpdated.sendOff(_ => DateTime.now())
    store.sendOff(_ => fetchAll)
  }

  private def fetchAll: Map[String, String] = {
    val keys = s3.client.listObjects(bucket).getObjectSummaries.asScala.map(_.getKey)
    keys.flatMap(k => getS3Object(k).map(k -> _)).toMap
  }
}


