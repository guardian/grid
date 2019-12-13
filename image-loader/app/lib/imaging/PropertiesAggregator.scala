package lib.imaging

import com.gu.mediaservice.model.FileMetadata.StringOrStrings

import scala.collection.mutable.ArrayBuffer

object PropertiesAggregator {

  def aggregateMetadataMap(initialMap: Map[String, String]): Map[String, StringOrStrings] = {

    val normaliseKeys = (k: String) => {
      val isArrayKey = k.contains("[")
      if (isArrayKey) {
        k.substring(0, k.indexOf("["))
      } else {
        k
      }
    }

    val mutableMap = scala.collection.mutable.Map[String, ArrayBuffer[String]]()

    for (originalKey <- initialMap.keySet) {
      val value = initialMap(originalKey)
      val normalisedKey = normaliseKeys(originalKey)
      if (mutableMap.contains(normalisedKey)) {
        mutableMap(normalisedKey) += value
      } else {
        mutableMap.put(normalisedKey, ArrayBuffer(value))
      }
    }

    val normalisedMap: Map[String, StringOrStrings] = mutableMap.map {
      case (k, v) =>
        val value = if (v.size > 1) Right(v.toList) else Left(v.head)
        (k, value)
    }.toMap

    normalisedMap
  }

}

