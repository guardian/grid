// TODO: Throw errors on invalid query parameters
package com.gu.mediaservice.lib.elasticsearch

import play.api.libs.json.Json.JsValueWrapper
import play.api.libs.json.Json


object Mappings {

  val nonAnalyzedString = Json.obj("type" -> "string", "index" -> "not_analyzed")
  val nonIndexedString  = Json.obj("type" -> "string", "index" -> "no")

  val snowballAnalysedString = Json.obj("type" -> "string", "analyzer" -> "snowball")
  val standardAnalysedString = Json.obj("type" -> "string", "analyzer" -> "standard")

  val simpleSuggester = Json.obj(
    "type" -> "completion",
    "index_analyzer" -> "simple",
    "search_analyzer" -> "simple"
  )

  val integer = Json.obj("type" -> "integer")
  val boolean = Json.obj("type" -> "boolean")
  val dateFormat = Json.obj("type" -> "date")

  val dynamicObj = Json.obj("type" -> "object", "dynamic" -> true)

  def nonDynamicObj(obj: (String, JsValueWrapper)*) = Json.obj("type" -> "object", "dynamic" -> "strict", "properties" -> Json.obj(obj:_*))

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

  val metadataMapping = nonDynamicObj(
    "dateTaken" -> dateFormat,
    "description" -> snowballAnalysedString,
    "byline" -> standardAnalysedString,
    "bylineTitle" -> standardAnalysedString,
    "title" -> snowballAnalysedString,
    "credit" -> nonAnalyzedString,
    "creditUri" -> nonAnalyzedString,
    "copyright" -> standardAnalysedString,
    "copyrightNotice" -> standardAnalysedString,
    "suppliersReference" -> standardAnalysedString,
    "source" -> nonAnalyzedString,
    "specialInstructions" -> nonAnalyzedString,
    "keywords" -> nonAnalysedList("keyword"),
    "subLocation" -> standardAnalysedString,
    "city" -> standardAnalysedString,
    "state" -> standardAnalysedString,
    "country" -> standardAnalysedString
  )


  // Ultimately both these usageRights should be unified, but
  // keeping them separate for now until used as such
  val imageUsageRightsMapping = nonDynamicObj(
    "category" -> nonAnalyzedString,
    "supplier" -> nonAnalyzedString,
    "suppliersCollection" -> nonAnalyzedString,
    "restrictions" -> standardAnalysedString,
    "photographer" -> standardAnalysedString,
    "publication" -> standardAnalysedString
  )

  val userMetadataUsageRightsMapping = nonDynamicObj(
    "cost" -> nonAnalyzedString,
    "category" -> nonAnalyzedString,
    "restrictions" -> standardAnalysedString,
    "photographer" -> standardAnalysedString,
    "publication" -> standardAnalysedString
  )


  val exportsMapping =
    nonDynamicObj(
      "id" -> nonAnalyzedString,
      "type" -> nonAnalyzedString,
      "author" -> nonAnalyzedString,
      "date" -> dateFormat,
      "specification" -> dynamicObj,
      "master" -> assetMapping,
      "assets" -> assetMapping
    )

  val userMetadataMapping =
    nonDynamicObj(
      "archived"    -> boolean,
      "labels"      -> nonAnalysedList("label"),
      "metadata"    -> metadataMapping,
      "usageRights" -> userMetadataUsageRightsMapping
    )

  val imageMapping: String =
    Json.stringify(Json.obj(
      "image" -> Json.obj(
        "dynamic" -> "strict",
        "properties" -> Json.obj(
          "id" -> nonAnalyzedString,
          "metadata" -> metadataMapping,
          "originalMetadata" -> metadataMapping,
          "usageRights" -> imageUsageRightsMapping,
          "originalUsageRights" -> imageUsageRightsMapping,
          "source" -> assetMapping,
          "thumbnail" -> assetMapping,
          "userMetadata" -> userMetadataMapping,
          "fileMetadata" -> dynamicObj,
          "exports" -> exportsMapping,
          "uploadTime" -> dateFormat,
          "uploadedBy" -> nonAnalyzedString,
          "lastModified" -> dateFormat,
          "identifiers" -> dynamicObj,
          "suggestMetadataCredit" -> simpleSuggester
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
