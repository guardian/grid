package com.gu.mediaservice.lib.auth

import com.amazonaws.auth.AWSCredentials
import com.gu.mediaservice.lib.BaseStore
import org.joda.time.DateTime

import scala.collection.JavaConverters._


class KeyStore(bucket: String, credentials: AWSCredentials) extends BaseStore[String, String](bucket, credentials) {
  def lookupIdentity(key: String): Option[String] =
    store.get().get(key)

  def findKey(prefix: String): Option[String] = s3.syncFindKey(bucket, prefix)

  def update() {
    lastUpdated.send(_ => DateTime.now())
    store.send(_ => fetchAll)
  }

  private def fetchAll: Map[String, String] = {
    val keys = s3.client.listObjects(bucket).getObjectSummaries.asScala.map(_.getKey)
    keys.flatMap(k => getS3Object(k).map(k -> _)).toMap
  }
}
