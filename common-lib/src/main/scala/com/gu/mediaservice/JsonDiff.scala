package com.gu.mediaservice

import play.api.libs.json.{JsArray, JsObject, JsValue}

object JsonDiff {

  private val ADD = "---"
  private val REMOVE = "+++"
  private val CHANGE = "≠≠≠"

  def diff(a: JsValue, b: JsValue): JsObject = {
    (a, b) match {
      case (ao: JsObject, bo: JsObject) =>
        val allKeys = ao.keys ++ bo.keys
        allKeys.toList.foldLeft[JsObject](JsObject.empty) {
          (acc, k) => {
            if (!bo.keys.contains(k)) {
              acc + ((k, JsObject(Seq((ADD, ao(k))))))
            } else if (!ao.keys.contains(k)) {
              acc + ((k, JsObject(Seq((REMOVE, bo(k))))))
            } else {
              val subDiff = diff(ao(k), bo(k))
              if (subDiff.keys.isEmpty) acc
              else {
                acc + ((k, JsObject(Seq((CHANGE, subDiff)))))
              }
            }
          }
        }
      case (aa: JsArray, ba: JsArray) if Set(aa.value) == Set(ba.value) => JsObject.empty
      case (aa: JsArray, ba: JsArray) =>
        val arrayAdded = Set(ba.value: _*) -- Set(aa.value: _*)
        val arrayRemoved = Set(aa.value: _*) -- Set(ba.value: _*)
        JsObject(Seq(
         (ADD, JsArray(arrayRemoved.toSeq)),
         (REMOVE, JsArray(arrayAdded.toSeq))
        ))
      case (av: JsValue, bv: JsValue) if av == bv => JsObject.empty
      case (av: JsValue, bv: JsValue) => JsObject(Seq((ADD, bv), (REMOVE, av)))
    }
  }
}
