package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.config.CommonConfig
import org.joda.time.DateTime

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext

sealed trait Tier
case object Internal extends Tier
case object External extends Tier

case class ApiKey(value: String, tier: Tier)

class KeyStore(bucket: String, config: CommonConfig)(implicit ec: ExecutionContext)
  extends BaseStore[String, ApiKey](bucket, config)(ec) {

  def lookupIdentity(key: String): Option[ApiKey] = store.get().get(key)

  def findKey(prefix: String): Option[String] = s3.syncFindKey(bucket, prefix)

  def update() {
    lastUpdated.send(_ => DateTime.now())
    store.send(_ => fetchAll)
  }

  private def fetchAll: Map[String, ApiKey] = {
    val keys = s3.client.listObjects(bucket).getObjectSummaries.asScala.map(_.getKey)
    // Check Dynamo
    keys.flatMap(k => getS3Object(k).map(k -> ApiKey(_, External))).toMap
  }
}
