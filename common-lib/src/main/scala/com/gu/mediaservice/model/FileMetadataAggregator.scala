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
    val stringifiedObj = Json.stringify(JsObject(Seq((objectFieldName, v))))
      .replace("\"", "'")
    (objectName, JsArray(Seq(JsString(stringifiedObj))))
  }

  private def entryToAggregatedKeyAndJsValue(k: String, v: JsValue): (String, JsValue) = {
    if (isArrayKey(k)) (normaliseArrayKey(k), JsArray(Seq(v))) else if (isDynamicObjectKey(k)) toObjectNameAndValue(k, v)
    else (k, v)
  }

  private def sortAggregatedValuesAtLevel(nodes: Map[String, JsValue], arrayNormKeyValuePairToIdx: Map[String, Int]) = {
    nodes.map {
      case (k, v) =>
        val sortedValues = if (v.isInstanceOf[JsArray]) {
          val sorted = v.as[JsArray].value.map(item => {
            val idx = if (item.isInstanceOf[JsString]) {
              val entryValue = item.as[JsString].value
              arrayNormKeyValuePairToIdx.getOrElse(s"$k-$entryValue", Int.MaxValue)
            } else Int.MaxValue
            (item, idx)
          }).sortBy(_._2).map(_._1)
          JsArray(sorted)
        } else v
        k -> sortedValues
    }
  }

  private def aggregateCurrentMetadataLevel(nodes: Map[String, JsValue], arrayNormKeyValuePairToIdx: Map[String, Int]): Map[String, JsValue] = {

    val mutableMap = scala.collection.mutable.Map[String, JsValue]()

    nodes.foreach {
      case (k, v) =>
        val (aggregatedKey, newValue) = entryToAggregatedKeyAndJsValue(k, v)
        if (mutableMap.contains(aggregatedKey) && newValue.isInstanceOf[JsArray]) {
          val cur = mutableMap(aggregatedKey).as[JsArray]
          val updated = cur ++ newValue.as[JsArray]
          mutableMap(aggregatedKey) = updated
        } else {
          mutableMap.put(aggregatedKey, newValue)
        }
    }

    sortAggregatedValuesAtLevel(mutableMap.toMap, arrayNormKeyValuePairToIdx)
  }

  def aggregateMetadataMap(flatProperties: Map[String, String]): Map[String, JsValue] = {

    val arrayNormKeyValuePairToIdx = flatProperties.filter { case (k, _) => isArrayKey(k) }.map { case (k, v) =>
      val idx = k.substring(k.lastIndexOf("[") + 1, k.lastIndexOf("]")).trim.toInt
      s"${normaliseArrayKey(k)}-$v" -> idx
    }

    val initialMetadataStructure = flatProperties.map { case (k, v) => k -> JsString(v) }

    var aggMetadata = aggregateCurrentMetadataLevel(initialMetadataStructure, arrayNormKeyValuePairToIdx)

    def anyKeyIsArrayKey(keys: Set[String]) = keys.exists(isArrayKey)

    def anyKeyIsDynamicObjectKey(keys: Set[String]) = keys.exists(isDynamicObjectKey)

    while (anyKeyIsArrayKey(aggMetadata.keySet) || anyKeyIsDynamicObjectKey(aggMetadata.keySet)) aggMetadata = aggregateCurrentMetadataLevel(aggMetadata, arrayNormKeyValuePairToIdx)

    aggMetadata
  }

}

