package com.gu.mediaservice.lib.bbc.components

import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.config.CommonConfig
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.Json

import scala.concurrent.ExecutionContext
import scala.util.{Failure, Success, Try}

class MetadataStore(bucket: String, config: CommonConfig)(implicit ec: ExecutionContext)
  extends BaseStore[String, BBCMetadataConfig](bucket, config)(ec) {

  val metadataMapKey = "metadataConfig"
  val metadataStoreKey = "photographers.json"

  def apply() = fetchAll match {
    case Some(_) => Logger.info("Metadata config read in from config bucket")
    case None => throw FailedToLoadMetadataConfigJson
  }

  def update() {
    lastUpdated.send(_ => DateTime.now())
    fetchAll match {
      case Some(config) => store.send(_ => config)
      case None => Logger.warn("Could not parse metadata config JSON into MetadataConfig class")
    }
  }

  private def fetchAll: Option[Map[String, BBCMetadataConfig]] = {
    getS3Object(metadataStoreKey) match {
      case Some(fileContents) => Try(Json.parse(fileContents).as[BBCMetadataConfig]) match {
        case Success(metadataConfigClass) => Some(Map(metadataMapKey -> metadataConfigClass))
        case Failure(_) => None
      }
      case None => None
    }
  }

  def get: BBCMetadataConfig = store.get()(metadataMapKey)
}

object MetadataStore {
  def apply(bucket: String, config: CommonConfig)(implicit ec: ExecutionContext): MetadataStore = {
    val store = new MetadataStore(bucket, config)(ec)
    store.fetchAll match {
      case Some(_) => Logger.info("Metadata config read in from config bucket")
      case None => throw FailedToLoadMetadataConfigJson
    }
    store
  }
}

case object FailedToLoadMetadataConfigJson extends Exception("Failed to load metadataConfig from S3 config bucket on start up")
