package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.DynamoStore
import com.gu.mediaservice.lib.config.CommonConfig
import org.joda.time.DateTime

import scala.concurrent.ExecutionContext

class KeyStore(tableName: String, config: CommonConfig)(implicit ec: ExecutionContext)
  extends DynamoStore[String, ApiKey](tableName, config)(ec) {

  def lookupIdentity(key: String): Option[ApiKey] = store.get().get(key)

  def findKey(name: String): Option[String] = store.get().find{ case (_, apiKey) => apiKey.name == name }.map(_._1)

  def update() {
    lastUpdated.send(_ => DateTime.now())
    store.send(_ => fetchAll)
  }

  private def fetchAll: Map[String, ApiKey] = {
    scanDynamoTable.foldLeft(Map.empty[String, ApiKey]) { (map, itemJson) =>
      val key = (itemJson \ "key").as[String]
      val name = (itemJson \ "name").as[String]
      val tier = (itemJson \ "tier").as[String]
      map ++ Map(key -> ApiKey(name, Tier(tier)))
    }
  }
}
