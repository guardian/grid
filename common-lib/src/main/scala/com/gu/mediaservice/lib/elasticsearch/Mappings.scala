// TODO: Throw errors on invalid query parameters
package com.gu.mediaservice.lib.elasticsearch

import play.api.libs.json.Json.JsValueWrapper
import play.api.libs.json.{JsObject, Json}


object Mappings {

  val nonAnalyzedString = Json.obj("type" -> "string", "index" -> "not_analyzed")
  val nonIndexedString  = Json.obj("type" -> "string", "index" -> "no")

  val sStemmerAnalysedString = Json.obj("type" -> "string", "analyzer" -> IndexSettings.enslishSStemmerAnalyzerName)
  val hierarchyAnalysedString = Json.obj("type" -> "string", "analyzer" -> IndexSettings.hierarchyAnalyserName)
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

  def withIndexName(indexName: String,  obj: JsObject) = Json.obj("index_Name" -> indexName) ++ obj

  // See: https://www.elastic.co/guide/en/elasticsearch/reference/1.6/mapping-core-types.html#copy-to
  // This copy the value to another field, generally with another
  // analyser to be searched in different ways.
  def copyTo(fieldName: String) = Json.obj("copy_to" -> fieldName)

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
    "description" -> sStemmerAnalysedString,
    "byline" -> standardAnalysedString,
    "bylineTitle" -> standardAnalysedString,
    "title" -> sStemmerAnalysedString,
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

  val usageRightsMapping = nonDynamicObj(
    "category" -> nonAnalyzedString,
    "restrictions" -> standardAnalysedString,
    "supplier" -> nonAnalyzedString,
    "suppliersCollection" -> nonAnalyzedString,
    "photographer" -> standardAnalysedString,
    "publication" -> nonAnalyzedString,
    "creator" -> nonAnalyzedString,
    "licence" -> nonAnalyzedString,
    "source" -> nonAnalyzedString,
    "contentLink" -> nonAnalyzedString,
    "suppliers" -> standardAnalysedString
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

  val actionDataMapping = nonDynamicObj(
    "author" -> nonAnalyzedString,
    "date" -> dateFormat
  )

  val collectionMapping = withIndexName("collection", nonDynamicObj(
    "path" -> nonAnalysedList("collectionPath"),
    "pathId" -> (nonAnalyzedString ++ copyTo("collections.pathHierarchy")),
    "pathHierarchy" -> hierarchyAnalysedString,
    "description" -> nonAnalyzedString,
    "actionData" -> actionDataMapping
  ))

  val userMetadataMapping =
    nonDynamicObj(
      "archived"    -> boolean,
      "labels"      -> nonAnalysedList("label"),
      "metadata"    -> metadataMapping,
      "usageRights" -> usageRightsMapping
    )

  val uploadInfoMapping =
    nonDynamicObj(
      "filename" -> nonAnalyzedString
    )

  val usageReference =
    nonDynamicObj(
      "type" -> nonAnalyzedString,
      "uri"  -> nonAnalyzedString,
      "name" -> sStemmerAnalysedString
    )

  val printUsageSize =
    nonDynamicObj(
      "x" -> integer,
      "y" -> integer
    )

  val printUsageMetadata =
    nonDynamicObj(
      "sectionName" -> nonAnalyzedString,
      "issueDate" -> dateFormat,
      "pageNumber" -> integer,
      "storyName" -> nonAnalyzedString,
      "publicationCode" -> nonAnalyzedString,
      "publicationName" -> nonAnalyzedString,
      "layoutId" -> integer,
      "edition" -> integer,
      "size" -> printUsageSize,
      "orderedBy" -> nonAnalyzedString,
      "sectionCode" -> nonAnalyzedString,
      "notes" -> nonAnalyzedString,
      "source" -> nonAnalyzedString
    )

  val digitalUsageMetadata =
    nonDynamicObj(
      "webTitle" -> nonAnalyzedString,
      "webUrl" -> nonAnalyzedString,
      "sectionId" -> nonAnalyzedString,
      "composerUrl" -> nonAnalyzedString
    )

  val usagesMapping =
    nonDynamicObj(
      "id"           -> nonAnalyzedString,
      "title"        -> sStemmerAnalysedString,
      "references"   -> usageReference,
      "platform"     -> nonAnalyzedString,
      "media"        -> nonAnalyzedString,
      "status"       -> nonAnalyzedString,
      "dateAdded"    -> dateFormat,
      "dateRemoved"  -> dateFormat,
      "lastModified" -> dateFormat,
      "printUsageMetadata" -> printUsageMetadata,
      "digitalUsageMetadata" -> digitalUsageMetadata
    )

  val imageMapping: String =
    Json.stringify(Json.obj(
      "image" -> Json.obj(
        "dynamic" -> "strict",
        "properties" -> Json.obj(
          "id" -> nonAnalyzedString,
          "metadata" -> metadataMapping,
          "originalMetadata" -> metadataMapping,
          "usageRights" -> usageRightsMapping,
          "originalUsageRights" -> usageRightsMapping,
          "source" -> assetMapping,
          "thumbnail" -> assetMapping,
          "userMetadata" -> userMetadataMapping,
          "userMetadataLastModified" -> dateFormat,
          "fileMetadata" -> dynamicObj,
          "exports" -> exportsMapping,
          "uploadTime" -> dateFormat,
          "uploadedBy" -> nonAnalyzedString,
          "lastModified" -> dateFormat,
          "identifiers" -> dynamicObj,
          "uploadInfo" -> uploadInfoMapping,
          "suggestMetadataCredit" -> simpleSuggester,
          "usages" -> usagesMapping,
          "usagesLastModified" -> dateFormat,
          "collections" -> collectionMapping,
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
