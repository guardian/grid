package com.gu.mediaservice.model

import play.api.libs.json.{JsArray, JsObject, JsString, JsValue}

import scala.collection.mutable.ArrayBuffer

object FileMetadataAggregator {

  def aggregateMetadataMap(initialMap: Map[String, String]): Map[String, JsValue] = {

    val getNormalisedKeyAndValType: String => (String, String, JsType) = (k: String) => {
      val isArrayKey = k.endsWith("]")
      val isSimpleDynamicObject = k.contains("/")
      val res = if (isArrayKey) {
        (k.substring(0, k.lastIndexOf("[")), "", JArr)
      } else if (isSimpleDynamicObject) {
        val sIdx = k.lastIndexOf("/")
        val l = k.substring(0, sIdx)
        val r = k.substring(sIdx + 1)
        (l, r, JObj)
      } else {
        (k, "", JStr)
      }
      res
    }

    val mutableMap = scala.collection.mutable.Map[String, (JsType, ArrayBuffer[String])]()

    for (originalKey <- initialMap.keySet) {
      val value = initialMap(originalKey)
      val (normalisedKey, rest, typ) = getNormalisedKeyAndValType(originalKey)
      if (mutableMap.contains(normalisedKey)) {
        if (rest.nonEmpty) mutableMap(normalisedKey)._2 += rest
        mutableMap(normalisedKey)._2 += value
      } else {
        if (rest.nonEmpty) {
          mutableMap.put(normalisedKey, (typ, ArrayBuffer(rest, value)))
        } else {
          mutableMap.put(normalisedKey, (typ, ArrayBuffer(value)))
        }
      }
    }

    val normalisedMap: Map[String, JsValue] = mutableMap.map {
      case (k, v) =>
        val props = v._2
        v._1 match {
          case JObj =>
            val tups = for (i <- props.indices by 2) yield (props(i), JsString(props(i + 1)))
            (k, JsObject(tups))
          case JArr | JStr =>
            val value = if (props.size > 1) JsArray(props.map(JsString)) else JsString(props.head)
            (k, value)
        }
    }.toMap

    normalisedMap
  }

}

trait JsType

case object JArr extends JsType

case object JStr extends JsType

case object JObj extends JsType
