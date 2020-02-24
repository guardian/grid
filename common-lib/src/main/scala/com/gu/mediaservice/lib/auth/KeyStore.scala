package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.config.CommonConfig
import org.joda.time.DateTime

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext

class KeyStore(bucket: String, config: CommonConfig)(implicit ec: ExecutionContext)
  extends BaseStore[String, ApiAccessor](bucket, config)(ec) {

  def lookupIdentity(key: String): Option[ApiAccessor] = store.get().get(key)

  def findKey(prefix: String): Option[String] = s3.syncFindKey(bucket, prefix)

  def update() {
    lastUpdated.send(_ => DateTime.now())
    store.send(_ => fetchAll)
  }

  private def fetchAll: Map[String, ApiAccessor] = {
    val keys = s3.client.listObjects(bucket).getObjectSummaries.asScala.map(_.getKey)
    keys.flatMap(k => getS3Object(k).map(k -> ApiAccessor(_))).toMap
  }
}
