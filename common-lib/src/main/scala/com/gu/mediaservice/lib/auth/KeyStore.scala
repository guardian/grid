package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.aws.S3Bucket
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model.Instance

import scala.concurrent.ExecutionContext

class KeyStore(bucket: S3Bucket, config: CommonConfig)(implicit ec: ExecutionContext)
  extends BaseStore[String, ApiAccessor](bucket, config)(ec) {

  def lookupIdentity(key: String)(implicit instance: Instance): Option[ApiAccessor] = store.get().get(instance.id + "/" + key)

  def update(): Unit = {
    store.set(fetchAll)
  }

  private def fetchAll: Map[String, ApiAccessor] = {
    s3.listObjectKeys(bucket).flatMap(k => getS3Object(k).map(k -> ApiAccessor(_))).toMap
  }
}
