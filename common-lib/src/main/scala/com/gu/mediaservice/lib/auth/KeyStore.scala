package com.gu.mediaservice.lib.auth

import com.amazonaws.services.s3.AmazonS3
import com.gu.mediaservice.lib.BaseStore
import org.joda.time.DateTime

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext

class KeyStore(bucket: String, client: AmazonS3)(implicit ec: ExecutionContext)
  extends BaseStore[String, ApiKey](bucket, client)(ec) {

  def lookupIdentity(key: String): Option[ApiKey] = store.get().get(key)

  def findKey(prefix: String): Option[String] = s3.syncFindKey(bucket, prefix)

  def update() {
    lastUpdated.send(_ => DateTime.now())
    store.send(_ => fetchAll)
  }

  private def fetchAll: Map[String, ApiKey] = {
    val keys = client.listObjects(bucket).getObjectSummaries.asScala.map(_.getKey)
    keys.flatMap(k => getS3Object(k).map(k -> ApiKey(_))).toMap
  }
}
