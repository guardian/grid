// TODO: Throw errors on invalid query parameters
package com.gu.mediaservice.lib.elasticsearch

import play.api.libs.json.Json.JsValueWrapper
import play.api.libs.json.{Json}


object Mappings {

  val nonAnalyzedString = Json.obj("type" -> "string", "index" -> "not_analyzed")
  val nonIndexedString  = Json.obj("type" -> "string", "index" -> "no")

  val snowballAnalysedString = Json.obj("type" -> "string", "analyzer" -> "snowball")
  val standardAnalysedString = Json.obj("type" -> "string", "analyzer" -> "standard")

  val integer = Json.obj("type" -> "integer")
  val boolean = Json.obj("type" -> "boolean")
  val dateFormat = Json.obj("type" -> "date")

  val dynamicObj = Json.obj("type" -> "object", "dynamic" -> true)

  def nonDynamicObj(obj: (String, JsValueWrapper)*) = Json.obj("type" -> "object", "dynamic" -> false, "properties" -> Json.obj(obj:_*))

  def nonAnalysedList(indexName: String) = Json.obj("type" -> "string", "index" -> "not_analyzed", "index_name" -> indexName)

  val identifiersMapping =
    nonDynamicObj(
      // TODO: extract these to a configuration setting
      "picdarUrn" -> standardAnalysedString
    )

  val dimensionsMapping =
    nonDynamicObj(
      "width" -> integer,
      "height" -> integer
    )

  val assetMapping =
    nonDynamicObj(
      "file" -> nonIndexedString,
      "secureUrl" -> nonIndexedString,
      "size" -> integer,
      "mimeType" -> nonAnalyzedString,
      "dimensions" -> dimensionsMapping
    )

  val metadataMapping = Json.obj(
    "properties" -> Json.obj(
      "description" -> snowballAnalysedString,
      "byline" -> standardAnalysedString,
      "title" -> snowballAnalysedString,
      "credit" -> nonAnalyzedString,
      "copyright" -> standardAnalysedString,
      "copyrightNotice" -> standardAnalysedString,
      "suppliersReference" -> standardAnalysedString,
      "source" -> standardAnalysedString,
      "specialInstructions" -> nonAnalyzedString,
      "keywords" -> nonAnalysedList("keyword"),
      "city" -> standardAnalysedString,
      "country" -> standardAnalysedString
    )
  )

  val exportsMapping =
    nonDynamicObj(
      "id" -> nonAnalyzedString,
      "type" -> nonAnalyzedString,
      "specification" -> dynamicObj,
      "assets" -> assetMapping
    )

  val userMetadataMapping =
    nonDynamicObj(
      "metadata" -> metadataMapping,
      "labels"   -> nonAnalysedList("label"),
      "archived" -> boolean
    )

  val imageMapping: String =
    Json.stringify(Json.obj(
      "image" -> Json.obj(
        "dynamic" -> "strict",
        "properties" -> Json.obj(
          "id" -> nonAnalyzedString,
          "metadata" -> metadataMapping,
          "source" -> assetMapping,
          "thumbnail" -> assetMapping,
          "userMetadata" -> userMetadataMapping,
          "fileMetadata" -> dynamicObj,
          "originalMetadata" -> metadataMapping,
          "exports" -> exportsMapping,
          "uploadTime" -> dateFormat,
          "uploadedBy" -> nonAnalyzedString,
          "identifiers" -> dynamicObj
        ),
        "dynamic_templates" -> Json.arr(Json.obj(
          "stored_json_object_template" -> Json.obj(
            "path_match" -> "fileMetadata.*",
            "mapping" -> Json.obj(
              "dynamic" -> true, // annoyingly we need this here too
              "store" -> "yes",
              "index" -> "no"
            )
          )
        ))
    )))

}
