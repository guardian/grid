package com.gu.mediaservice

import play.api.libs.json.{JsArray, JsObject, JsValue}

object JsonDiff {
  def diff(a: JsValue, b: JsValue): JsObject = {
    (a, b) match {
      case (ao: JsObject, bo: JsObject) =>
        val allKeys = ao.keys ++ bo.keys
        allKeys.toList.foldLeft[JsObject](JsObject.empty) {
          (acc, k) => {
            if (!bo.keys.contains(k)) {
              acc + ((k, JsObject(Seq(("-", ao(k))))))
            } else if (!ao.keys.contains(k)) {
              acc + ((k, JsObject(Seq(("+", bo(k))))))
            } else {
              val subDiff = diff(ao(k), bo(k))
              if (subDiff.keys.isEmpty) acc
              else acc + ((k, JsObject(Seq(("~", subDiff)))))
            }
          }
        }
      case (aa: JsArray, ba: JsArray) if Set(aa.value) == Set(ba.value) => JsObject.empty
      case (aa: JsArray, ba: JsArray) =>
        val arrayAdded = Set(ba.value: _*) -- Set(aa.value: _*)
        val arrayRemoved = Set(aa.value: _*) -- Set(ba.value: _*)
        JsObject(Seq(
         ("+", JsArray(arrayAdded.toSeq)),
         ("-", JsArray(arrayRemoved.toSeq))
        ))
      case (av: JsValue, bv: JsValue) if av == bv => JsObject.empty
      case (av: JsValue, bv: JsValue) => JsObject(Seq(("+", av), ("-", bv)))
    }
  }
}
