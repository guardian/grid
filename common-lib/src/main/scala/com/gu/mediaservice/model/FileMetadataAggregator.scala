package com.gu.mediaservice.model

import play.api.libs.json._

object FileMetadataAggregator {

  private def isArrayKey(k: String) = k.endsWith("]")

  private def isCustomObjectKey(k: String) = k.contains("/")

  private def isCustomObjectArrayKey(k: String) = k.contains("]/")

  private def normaliseArrayKey(k: String) = k.substring(0, k.lastIndexOf("["))

  private case class MetadataEntry(index: Int, jsValue: JsValue)

  private def entryToAggregatedKeyAndJsValue(k: String, v: MetadataEntry): (String, MetadataEntry) = {

    def toCustomObjectKeyAndValue(k: String, v: MetadataEntry) = {
      val slashIdx = k.lastIndexOf("/")
      val objectName = k.substring(0, slashIdx)
      val objectFieldName = k.substring(slashIdx + 1)
      val stringifiedObj = Json.stringify(JsObject(Seq((objectFieldName, v.jsValue))))
        .replace("\"", "'")
      val newJsVal = JsArray(Seq(JsString(stringifiedObj)))
      (objectName, v.copy(
        jsValue = newJsVal
      ))
    }

    def toArrayKeyAndValue(k: String, v: MetadataEntry) = {
      val arrValue = JsArray(Seq(v.jsValue))
      (normaliseArrayKey(k), v.copy(jsValue = arrValue))
    }

    if (isArrayKey(k)) toArrayKeyAndValue(k, v) else if (isCustomObjectKey(k)) toCustomObjectKeyAndValue(k, v) else (k, v)
  }

  private def aggregateCurrentMetadataLevel(nodes: Map[String, JsValue]): Map[String, JsValue] = {

    def getIdxFromKey(k: String): Int = {
      if (isArrayKey(k) || isCustomObjectArrayKey(k)) k.substring(k.lastIndexOf("[") + 1, k.lastIndexOf("]")).trim.toInt
      else Int.MaxValue
    }

    val entriesWithIndexes = nodes.map { case (k, v) => k -> MetadataEntry(getIdxFromKey(k), v) }

    val mutableMap = scala.collection.mutable.Map[String, Either[MetadataEntry, List[MetadataEntry]]]()

    entriesWithIndexes.foreach {
      case (k, v) =>
        val (aggregatedKey, newMetadataEntry) = entryToAggregatedKeyAndJsValue(k, v)
        if (mutableMap.contains(aggregatedKey)) {
          val updated: List[MetadataEntry] = mutableMap(aggregatedKey) match {
            case scala.util.Left(value) => List(value, newMetadataEntry)
            case scala.util.Right(value) => newMetadataEntry +: value
          }
          mutableMap(aggregatedKey) = scala.util.Right(updated)
        } else {
          mutableMap.put(aggregatedKey, scala.util.Left(newMetadataEntry))
        }
    }

    val mapWithSortedValuesAtCurrentLevel = mutableMap.mapValues { v =>
      v match {
        case scala.util.Left(value) => value.jsValue
        case scala.util.Right(value) => value.sortBy(_.index).map(_.jsValue.as[JsArray]).foldLeft(JsArray.empty)((acc, item) => acc ++ item)
      }
    }

    mapWithSortedValuesAtCurrentLevel.toMap
  }

  def aggregateMetadataMap(flatProperties: Map[String, String]): Map[String, JsValue] = {

    val initialMetadataStructure = flatProperties.mapValues(JsString)

    var aggMetadata = aggregateCurrentMetadataLevel(initialMetadataStructure)

    def anyKeyIsArrayKey(keys: Set[String]) = keys.exists(isArrayKey)

    def anyKeyIsDynamicObjectKey(keys: Set[String]) = keys.exists(isCustomObjectKey)

    while (anyKeyIsArrayKey(aggMetadata.keySet) || anyKeyIsDynamicObjectKey(aggMetadata.keySet)) aggMetadata = aggregateCurrentMetadataLevel(aggMetadata)

    aggMetadata
  }

}

