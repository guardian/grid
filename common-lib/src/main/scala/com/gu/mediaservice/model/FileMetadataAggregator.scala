package com.gu.mediaservice.model

import play.api.libs.json._

object FileMetadataAggregator {

  private def isArrayKey(k: String) = k.endsWith("]")

  private def isDynamicObjectKey(k: String) = k.contains("/")

  private def normaliseArrayKey(k: String) = k.substring(0, k.lastIndexOf("["))

  private def toObjectNameAndValue(k: String, v: JsValue) = {
    val slashIdx = k.lastIndexOf("/")
    val objectName = k.substring(0, slashIdx)
    val objectFieldName = k.substring(slashIdx + 1)
    val stringifiedObj = Json.stringify(JsObject(Seq((objectFieldName, v)))).replace("\"", "'")
    (objectName, JsArray(Seq(JsString(stringifiedObj))))
  }

  private def entryToAggregatedKeyAndJsValue(k: String, v: JsValue): (String, JsValue) = {
   if (isArrayKey(k)) (normaliseArrayKey(k), JsArray(Seq(v))) else if (isDynamicObjectKey(k)) toObjectNameAndValue(k, v) else (k, v)
  }

  def aggregateCurrentMetadataLevel(nodes: Map[String, JsValue]): Map[String, JsValue] = {

    val mutableMap = scala.collection.mutable.Map[String, JsValue]()

    nodes.foreach {
      case (k, v) =>
        val (aggKey, aggV) = entryToAggregatedKeyAndJsValue(k, v)
        if (mutableMap.contains(aggKey) && aggV.isInstanceOf[JsArray]) {
          val cur = mutableMap(aggKey).as[JsArray]
          val updated = cur ++ aggV.as[JsArray]
          mutableMap(aggKey) = updated
        } else {
          mutableMap.put(aggKey, aggV)
        }
    }

    mutableMap.toMap
  }

  def aggregateMetadataMap(flatProperties: Map[String, String]): Map[String, JsValue] = {

    val initialMetadataStructure = flatProperties.map { case (k, v) => k -> JsString(v) }

    var aggMetadata = aggregateCurrentMetadataLevel(initialMetadataStructure)

    def anyKeyIsArrayKey(keys: Set[String]) = keys.exists(isArrayKey)

    def anyKeyIsDynamicObjectKey(keys: Set[String]) = keys.exists(isDynamicObjectKey)

    while (anyKeyIsArrayKey(aggMetadata.keySet) || anyKeyIsDynamicObjectKey(aggMetadata.keySet)) aggMetadata = aggregateCurrentMetadataLevel(aggMetadata)

    aggMetadata
  }

}

