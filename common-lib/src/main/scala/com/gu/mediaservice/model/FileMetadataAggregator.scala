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

  private def getIdxBetweenArrayBrackets(k: String): Int = k.substring(k.lastIndexOf("[") + 1, k.lastIndexOf("]")).trim.toInt

  private def aggregateCurrentMetadataLevel(nodes: Map[String, MetadataEntry]): Map[String, MetadataEntry] = {

    def toEntriesWithUpdatedIndexes(nodes: Map[String, MetadataEntry]) = {
      nodes.map { case (k, v) =>
        val previousIdx = v.index
        val curIdx: Int = getIdxFromKeyIfItExistsOrPreviousIdx(k, previousIdx)
        k -> MetadataEntry(curIdx, v.jsValue)
      }
    }

    val entriesWithIndexes: Map[String, MetadataEntry] = toEntriesWithUpdatedIndexes(nodes)

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

    val mapWithSortedValuesAtCurrentLevel = mutableMap.mapValues {
      case scala.util.Left(value) => value
      case scala.util.Right(value) => {
        val sortedList = value.sortBy(_.index)

        val (jsArrays, jsStrings) = sortedList.map(_.jsValue).partition(_.isInstanceOf[JsArray])

        val aggJsArrays: JsArray = jsArrays.map(_.as[JsArray]).foldLeft(JsArray.empty)((acc, arrayItem) => acc ++ arrayItem)
        val aggJsStrings: JsArray = jsStrings.map(_.as[JsString]).foldLeft(JsArray.empty)((acc, item) => acc.append(item))

        val sorted: JsArray =  aggJsArrays ++ aggJsStrings
        MetadataEntry(sortedList.head.index, sorted)
      }
    }
    mapWithSortedValuesAtCurrentLevel.toMap
  }

  def getIdxFromKeyIfItExistsOrPreviousIdx(k: String, other: Int): Int = {
    if (isArrayKey(k) || isCustomObjectArrayKey(k)) {
      getIdxBetweenArrayBrackets(k)
    } else {
      /**
        * eventually any array key will become a simple value key
        * that is why we have - 1 here as we want to prioritise it every iteration
        * such that simple values will be prioritised over custom nested objects
        * for example we want
        *
        * [ "the xmp description", ["{'xml:lang':'x-default'}"] ]
        *
        * not
        *
        * [ ["{'xml:lang':'x-default'}"],"the xmp description" ]
        */
      other - 1
    }
  }

  def aggregateMetadataMap(flatProperties: Map[String, String]): Map[String, JsValue] = {

    def toInitialEntriesWithIndexes(nodes: Map[String, JsValue]) = {
      val previousIndex = Int.MaxValue
      nodes.map { case (k, v) =>
        val curIdx: Int = getIdxFromKeyIfItExistsOrPreviousIdx(k, previousIndex)
        k -> MetadataEntry(curIdx, v)
      }
    }

    val initialMetadataStructure = toInitialEntriesWithIndexes(flatProperties.mapValues(JsString))

    var aggMetadata = aggregateCurrentMetadataLevel(initialMetadataStructure)

    def anyKeyIsArrayKey(keys: Set[String]) = keys.exists(isArrayKey)

    def anyKeyIsDynamicObjectKey(keys: Set[String]) = keys.exists(isCustomObjectKey)

    while (anyKeyIsArrayKey(aggMetadata.keySet) || anyKeyIsDynamicObjectKey(aggMetadata.keySet)) aggMetadata = aggregateCurrentMetadataLevel(aggMetadata)

    aggMetadata.mapValues(_.jsValue)
  }

}

