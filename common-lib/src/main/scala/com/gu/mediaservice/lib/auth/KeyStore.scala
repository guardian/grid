package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.config.CommonConfig
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request

import scala.jdk.CollectionConverters._
import scala.concurrent.ExecutionContext

class KeyStore(bucket: String, config: CommonConfig)(implicit ec: ExecutionContext)
  extends BaseStore[String, ApiAccessor](bucket, config)(ec) {

  def lookupIdentity(key: String): Option[ApiAccessor] = store.get().get(key)

  def findKey(prefix: String): Option[String] = s3.syncFindKey(bucket, prefix)

  def update(): Unit = {
    store.set(fetchAll)
  }

  private def fetchAll: Map[String, ApiAccessor] = {
    val contents = s3.client.listObjectsV2(ListObjectsV2Request.builder().bucket(bucket).build())
      .contents().asScala.toList
    val keys = contents.map(_.key())
    keys.flatMap(k => getS3Object(k).map(k -> ApiAccessor(_))).toMap
  }
}
