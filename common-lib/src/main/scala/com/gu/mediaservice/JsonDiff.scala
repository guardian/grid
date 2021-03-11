package com.gu.mediaservice

import play.api.libs.json.{JsArray, JsObject, JsValue}

import scala.collection.Set

object JsonDiff {

  private val REMOVE = "---"
  private val ADD = "+++"
  private val CHANGE = "≠≠≠"

  def diff(a: JsValue, b: JsValue): JsObject = {
    (a, b) match {
      case (ao: JsObject, bo: JsObject) =>
        val allKeys = ao.keys ++ bo.keys
        allKeys.toList.foldLeft[JsObject](JsObject.empty) {
          (acc, k) => {
            if (!bo.keys.contains(k)) {
              acc + ((k, JsObject(Seq((REMOVE, ao(k))))))
            } else if (!ao.keys.contains(k)) {
              acc + ((k, JsObject(Seq((ADD, bo(k))))))
            } else {
              val subDiff = diff(ao(k), bo(k))
              if (subDiff.keys.isEmpty) acc
              else {
                acc + ((k, JsObject(Seq((CHANGE, subDiff)))))
              }
            }
          }
        }
      case (aa: JsArray, ba: JsArray) => compareArrays(aa, ba)
      case (av: JsValue, bv: JsValue) if av == bv => JsObject.empty
      case (av: JsValue, bv: JsValue) => JsObject(Seq((REMOVE, av), (ADD, bv)))
    }
  }

  private def compareArrays(aa: JsArray, ba: JsArray) = {
    val aav = aa.value.toList
    val bbv = ba.value.toList
    val arrayRemoved = removeMatches(aav, bbv)
    val arrayAdded = removeMatches(bbv, aav)

    val noChanges = JsObject.empty

    val removeChanges = if (arrayRemoved.isEmpty) noChanges
    else noChanges + (REMOVE, JsArray(arrayRemoved))

    if (arrayAdded.isEmpty) removeChanges
    else removeChanges + (ADD, JsArray(arrayAdded))
  }

  private def removeMatches(aav: List[JsValue], bbv: List[JsValue]) = {
    aav.filter(aItem => !bbv.exists(bItem => JsonDiff.diff(aItem, bItem).keys.isEmpty))
  }
}
