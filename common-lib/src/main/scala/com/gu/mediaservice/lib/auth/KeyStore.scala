package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model.Instance

import scala.jdk.CollectionConverters._
import scala.concurrent.ExecutionContext

class KeyStore(bucket: String, config: CommonConfig)(implicit ec: ExecutionContext)
  extends BaseStore[String, ApiAccessor](bucket, config)(ec) {

  def lookupIdentity(key: String)(implicit instance: Instance): Option[ApiAccessor] = store.get().get(instance.id + "/" + key)

  def update(): Unit = {
    store.set(fetchAll)
  }

  private def fetchAll: Map[String, ApiAccessor] = {
    val keys = s3.client.listObjects(bucket).getObjectSummaries.asScala.map(_.getKey)
    keys.flatMap(k => getS3Object(k).map(k -> ApiAccessor(_))).toMap
  }
}
