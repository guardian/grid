package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.config.CommonConfig
import software.amazon.awssdk.services.s3.model.ListObjectsRequest

import scala.jdk.CollectionConverters._
import scala.concurrent.ExecutionContext

class KeyStore(bucket: String, config: CommonConfig)(implicit ec: ExecutionContext)
  extends BaseStore[String, ApiAccessor](bucket, config)(ec) {

  def lookupIdentity(key: String): Option[ApiAccessor] = store.get().get(key)

  def update(): Unit = {
    store.set(fetchAll)
  }

  private def fetchAll: Map[String, ApiAccessor] = {
    val listObjects = s3.client.listObjects(ListObjectsRequest.builder().bucket(bucket).build())
    val keys = listObjects.contents().asScala.map(_.key())
    keys.flatMap(k => getS3Object(k).map(k -> ApiAccessor(_))).toMap
  }
}
