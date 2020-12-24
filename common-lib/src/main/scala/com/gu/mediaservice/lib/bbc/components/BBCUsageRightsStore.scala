package com.gu.mediaservice.lib.bbc.components

import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.config.CommonConfig
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.Json

import scala.concurrent.ExecutionContext
import scala.util.{Failure, Success, Try}

class BBCUsageRightsStore(bucket: String, config: CommonConfig)(implicit ec: ExecutionContext)
  extends BaseStore[String, BBCUsageRightsConfig](bucket, config)(ec) {

  val usageRightsMapKey = "usageRights"
  val usageRightsStoreKey = "usage_rights.json"

  def apply() = fetchAll match {
    case Some(_) => Logger.info("Usage Rights config read in from config bucket")
    case None => throw FailedToLoadUsageRightsConfigJson
  }

  def update() {
    lastUpdated.send(_ => DateTime.now())
    fetchAll match {
      case Some(config) => store.send(_ => config)
      case None => Logger.warn("Could not parse usage rights config JSON into UsageRightsConfig class")
    }
  }

  def fetchAll: Option[Map[String, BBCUsageRightsConfig]] = {
    getS3Object(usageRightsStoreKey) match {
      case Some(fileContents) => {
        Try(Json.parse(fileContents).as[BBCUsageRightsConfig]) match {
          case Success(usageRightsConfigClass) => Some(Map(usageRightsMapKey -> usageRightsConfigClass))
          case Failure(e) => None
        }
      }
      case None => None
    }
  }

  def get: BBCUsageRightsConfig = store.get()(usageRightsMapKey)

}

object UsageRightsStore {
  def apply(bucket: String, config: CommonConfig)(implicit ec: ExecutionContext): BBCUsageRightsStore = {
    val store = new BBCUsageRightsStore(bucket, config)(ec)
    store.fetchAll match {
      case Some(_) => Logger.info("Usage rights config read in from config bucket")
      case None => throw FailedToLoadMetadataConfigJson
    }
    store
  }
}

case object FailedToLoadUsageRightsConfigJson extends Exception("Failed to load UsageRightsConfig from S3 config bucket on start up")
