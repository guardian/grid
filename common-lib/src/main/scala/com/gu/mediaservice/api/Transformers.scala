package com.gu.mediaservice.api

import java.net.{URI, URLEncoder}

import com.gu.mediaservice.lib.argo.model.{EmbeddedEntity, Action}
import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.model.{Edits, ImageMetadata}
import play.api.libs.json._

class Transformers(services: Services) {

  import services.metadataBaseUri

  def boolOrFalse(bool: JsValue): JsBoolean =
    bool.asOpt[JsBoolean].getOrElse(JsBoolean(false))

  def arrayOrEmpty(arr: JsValue): JsArray =
    arr.asOpt[JsArray].getOrElse(Json.arr())

  def objectOrEmpty(obj: JsValue): JsObject =
    obj.asOpt[JsObject].getOrElse(Json.obj())

  def dataObjOrEmpty(obj: JsValue): JsObject =
    obj.asOpt[JsObject].map(u => Json.obj("data" -> u)).getOrElse(Json.obj())

  def encodeUriParam(param: String) = URLEncoder.encode(param, "UTF-8")

  def wrapAllMetadata(id: String): Reads[JsObject] =
    __.read[JsObject].map { data =>
      Json.obj(
        "uri" -> s"$metadataBaseUri/metadata/$id",
        "data" -> (
          data ++ Json.obj(
            "archived" -> boolOrFalse(data \ "archived").transform(wrapArchived(id)).get,
            "labels" -> arrayOrEmpty(data \ "labels").transform(wrapLabels(id)).get,
            "metadata" -> objectOrEmpty(data \ "metadata").transform(wrapMetadata(id)).get,
            "usageRights" -> (data \ "usageRights").transform(wrapUsageRights(id)).get
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

  def entityUri(id: String, endpoint: String = ""): URI =
    URI.create(s"$metadataBaseUri/metadata/$id$endpoint")

  type MetadataEntity = EmbeddedEntity[ImageMetadata]

  def metadataEntity(id: String, m: ImageMetadata): Option[MetadataEntity] =
    Edits.noneIfEmptyMetadata(m).map(i =>
      EmbeddedEntity(entityUri(id, "/metadata"), Some(i), actions = List(
        Action("set-metadata-from-usage-rights", entityUri(id, "/metadata/set-from-usage-rights"), "POST")
      ))
    )

  def wrapMetadata(id: String): Reads[JsObject] =
    __.read[JsObject].map { metadata =>
      Json.obj(
        "uri" -> s"$metadataBaseUri/metadata/$id/metadata",
        // FIXME: This is because we `Json.write` from the `ImageMetadata` case
        // class on the edits service. As we haven't keywords writeNullable, it
        // always returns Array(). This is just making sure that bug is replicated
        // so we can do equalities to see if the services are synced. This will
        // be rectified when we use Argo here.
        "data" -> (metadata ++ Json.obj("keywords" -> Json.arr())),
        "actions" -> List(Action("set-from-usage-rights",
          URI.create(s"$metadataBaseUri/metadata/$id/metadata/set-from-usage-rights"), "POST"))
      )
    }

  // no data == no overide
  // {} data == override with nothing
  // otherwise treat as normal
  def wrapUsageRights(id: String): Reads[JsObject] =
    __.read[JsValue].map { usageRights =>
      Json.obj(
        "uri" -> s"$metadataBaseUri/metadata/$id/usage-rights"
      ) ++ dataObjOrEmpty(usageRights)
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

}
