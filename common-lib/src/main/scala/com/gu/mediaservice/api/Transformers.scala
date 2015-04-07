package com.gu.mediaservice.api

import java.net.URLEncoder

import com.gu.mediaservice.lib.config.Services
import play.api.libs.json._

class Transformers(services: Services) {

  import services.metadataBaseUri

  def boolOrFalse(bool: JsValue): JsBoolean =
    bool.asOpt[JsBoolean].getOrElse(JsBoolean(false))

  def arrayOrEmpty(arr: JsValue): JsArray =
    arr.asOpt[JsArray].getOrElse(Json.arr())

  def objectOrEmpty(obj: JsValue): JsObject =
    obj.asOpt[JsObject].getOrElse(Json.obj())

  def encodeUriParam(param: String) = URLEncoder.encode(param, "UTF-8")

  def wrapAllMetadata(id: String): Reads[JsObject] =
    __.read[JsObject].map { data =>
      Json.obj(
        "uri" -> s"$metadataBaseUri/metadata/$id",
        "data" -> (
          data ++ Json.obj(
            "archived" -> boolOrFalse(data \ "archived").transform(wrapArchived(id)).get,
            "labels" -> arrayOrEmpty(data \ "labels").transform(wrapLabels(id)).get,
            "rights" -> arrayOrEmpty(data \ "rights").transform(wrapRights(id)).get,
            "metadata" -> objectOrEmpty(data \ "metadata").transform(wrapMetadata(id)).get
          )
        )
      )
    }

  def wrapArchived(id: String): Reads[JsObject] =
    __.read[JsBoolean].map { archived =>
      Json.obj(
        "uri" -> s"$metadataBaseUri/metadata/$id/archived",
        "data" -> archived
      )
    }

  def wrapMetadata(id: String): Reads[JsObject] =
    __.read[JsValue].map { metadata =>
      Json.obj(
        "uri" -> s"$metadataBaseUri/metadata/$id/metadata",
        "data" -> metadata
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
        "uri" -> s"$metadataBaseUri/metadata/$id/labels/${encodeUriParam(label)}",
        "data" -> label
      )
    }

  def wrapRights(id: String): Reads[JsObject] =
    __.read[JsArray].map { rights =>
      Json.obj(
        "uri" -> s"$metadataBaseUri/metadata/$id/rights",
        "data" -> rights.value.map(right => right.transform(wrapRight(id)).get)
      )
    }

  def wrapRight(id: String): Reads[JsObject] =
    __.read[JsString].map { case JsString(right) =>
      Json.obj(
        "uri" -> s"$metadataBaseUri/metadata/$id/rights/${encodeUriParam(right)}",
        "data" -> right
      )
    }
}
