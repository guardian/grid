package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.config.CommonConfig
import org.joda.time.DateTime

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext

sealed trait Tier
case object Internal extends Tier
case object External extends Tier
object Tier {
  def apply(value: String): Tier = value.toLowerCase match {
    case "internal" => Internal
    case "external" => External
    case _ => Internal
  }
}

case class ApiKey(value: String, tier: Tier)
object ApiKey extends ArgoHelpers {
  val unauthorizedResult = respondError(Forbidden, "forbidden", "Not authorized - the API key is not allowed to perform this operation", List.empty)
}

class KeyStore(bucket: String, config: CommonConfig)(implicit ec: ExecutionContext)
  extends BaseStore[String, ApiKey](bucket, config)(ec) {

  def lookupIdentity(key: String): Option[ApiKey] = store.get().get(key)

  def findKey(prefix: String): Option[String] = s3.syncFindKey(bucket, prefix)

  def update() {
    lastUpdated.send(_ => DateTime.now())
    store.send(_ => fetchAll)
  }

  private def apiKeyFromS3Content(content: String): ApiKey = {
    val rows = content.split("\n")
    val name = rows.head
    val tier = rows.tail.headOption.map(Tier(_)).getOrElse(Internal)
    ApiKey(name, tier)
  }

  private def fetchAll: Map[String, ApiKey] = {
    val keys = s3.client.listObjects(bucket).getObjectSummaries.asScala.map(_.getKey)
    keys.flatMap(k => getS3Object(k).map(k -> apiKeyFromS3Content(_))).toMap
  }
}
