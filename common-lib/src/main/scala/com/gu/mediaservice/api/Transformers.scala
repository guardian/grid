package com.gu.mediaservice.api

import com.gu.mediaservice.lib.config.Services
import play.api.libs.json._

class Transformers(services: Services) {

  import services.metadataBaseUri

  def arrayOrEmpty(arr: JsValue): JsArray =
    arr.asOpt[JsArray].getOrElse(Json.arr())

  def objectOrEmpty(arr: JsValue): JsObject =
    arr.asOpt[JsObject].getOrElse(Json.obj())

  def wrapMetadata(id: String): Reads[JsObject] =
    __.read[JsObject].map { data =>
      println(data \ "labels")
      Json.obj(
        "uri" -> s"$metadataBaseUri/metadata/$id",
        "data" -> (data ++ Json.obj("labels" -> arrayOrEmpty(data \ "labels").transform(wrapLabels(id)).get))
      )
    }

  def wrapLabels(id: String): Reads[JsObject] =
    __.read[JsArray].map { labels =>
      Json.obj(
        "uri" -> s"$metadataBaseUri/metadata/$id/labels",
        "data" -> labels.value.map(label => label.transform(wrapLabel(id)).get)
      )
    }

  def wrapLabel(id: String): Reads[JsObject] =
    __.read[JsString].map { case JsString(label) =>
      Json.obj(
        "uri" -> s"$metadataBaseUri/metadata/$id/labels/$label",
        "data" -> label
      )
    }
}
