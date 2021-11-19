package com.gu.mediaservice.lib.elasticsearch

import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.fields.{DynamicField, KeywordField, NestedField, ObjectField}
import com.sksamuel.elastic4s.requests.mappings.MappingDefinition
import com.sksamuel.elastic4s.requests.mappings.dynamictemplate.{DynamicMapping, DynamicTemplateRequest}
import play.api.libs.json.{JsObject, Json}

object Mappings {

  val imageMapping: MappingDefinition = {

    // Non indexed fields stored as keywords can still participate in exists / has queries
    def filemetaDataStringsAsKeyword: DynamicTemplateRequest = {
      // Extremely long user generated file metadata files may prevent an image from been ingested due to an keyword size limit in the underlying Lucene index.
      // As a trade off between reliable ingestion, the has field feature and the complexity budget, use the ignore_above field parameter to ignore long fields.
      // These ignored fields will still be visible in the persisted document source (and therefore API output) but will omitted from
      // has field search results.

      val maximumBytesOfKeywordInUnderlyingLuceneIndex = 32766
      // Unicode characters require more than 1 byte so allow some head room
      val maximumStringLengthToStore = (maximumBytesOfKeywordInUnderlyingLuceneIndex * .9).toInt

      DynamicTemplateRequest(
        name = "file_metadata_fields_as_keywords",
        mapping = KeywordField(
          name = "",
          index = Some(true),
          store = Some(true),
          ignoreAbove = Some(maximumStringLengthToStore)
        )
      ).pathMatch("fileMetadata.*").matchMappingType("string")
    }

    def storedJsonObjectTemplate: DynamicTemplateRequest = {
      DynamicTemplateRequest(
        name = "stored_json_object_template",
        mapping = DynamicField(
          name = "",
          index = Some(true),
          store = Some(true)
        )
      ).pathMatch("fileMetadata.*")
    }

    MappingDefinition(
      dynamic = Some(DynamicMapping.Strict),
      dateDetection = Some(false),
      templates = Seq(filemetaDataStringsAsKeyword, storedJsonObjectTemplate),
      properties = List(
        keywordField("id"),
        metadataMapping("metadata"),
        metadataMapping("originalMetadata"),
        usageRightsMapping("usageRights"),
        syndicationRightsMapping("syndicationRights"),
        usageRightsMapping("originalUsageRights"),
        assetMapping("source"),
        assetMapping("thumbnail"),
        assetMapping("optimisedPng"),
        userMetadataMapping("userMetadata"),
        dateField("userMetadataLastModified"),
        dynamicObj("fileMetadata"),
        exportsMapping("exports"),
        dateField("uploadTime"),
        keywordField("uploadedBy"),
        softDeletedMetadataMapping("softDeletedMetadata"),
        dateField("lastModified"),
        dynamicObj("identifiers"),
        uploadInfoMapping("uploadInfo"),
        simpleSuggester("suggestMetadataCredit"),
        usagesMapping("usages"),
        keywordField("usagesPlatform"),
        keywordField("usagesStatus"),  // TODO ES1 include_in_parent emulated with explicit copy_to rollup field for nested field which is also used for image filtering
        dateField("usagesLastModified"),   // TODO ES1 include_in_parent emulated with explicit copy_to rollup field for nested field which is also used for image filtering
        leasesMapping("leases"),
        collectionMapping("collections"),
        esInfoMapping("esInfo")
      )
    )
  }

  def dimensionsMapping(name: String) = nonDynamicObjectField(name).copy(properties = Seq(
    intField("width"),
    intField("height")
  ))

  def assetMapping(name: String) = nonDynamicObjectField(name).copy(properties = Seq(
    nonIndexedString("file"),
    nonIndexedString("secureUrl"),
    intField("size"),
    keywordField("mimeType"),
    dimensionsMapping("dimensions")
  ))

  def metadataMapping(name: String): ObjectField = nonDynamicObjectField(name).copy(properties = Seq(
    dateField("dateTaken"),
    sStemmerAnalysed("description"),
    standardAnalysed("byline").copy(copyTo = Seq("metadata.englishAnalysedCatchAll")),
    standardAnalysed("bylineTitle"),
    sStemmerAnalysed("title"),
    keywordField("credit").copy(copyTo = Seq("metadata.englishAnalysedCatchAll")),
    keywordField("creditUri"),
    standardAnalysed("copyright"),
    standardAnalysed("suppliersReference").copy(copyTo = Seq("metadata.englishAnalysedCatchAll")),
    keywordField("source").copy(copyTo = Seq("metadata.englishAnalysedCatchAll")),
    nonAnalysedList("keywords").copy(copyTo = Seq("metadata.englishAnalysedCatchAll")),
    nonAnalysedList("subjects"),
    keywordField("specialInstructions"),
    standardAnalysed("subLocation").copy(copyTo = Seq("metadata.englishAnalysedCatchAll")),
    standardAnalysed("city").copy(copyTo = Seq("metadata.englishAnalysedCatchAll")),
    standardAnalysed("state").copy(copyTo = Seq("metadata.englishAnalysedCatchAll")),
    standardAnalysed("country").copy(copyTo = Seq("metadata.englishAnalysedCatchAll")),
    nonAnalysedList("peopleInImage").copy(copyTo = Seq("metadata.englishAnalysedCatchAll")),
    sStemmerAnalysed("englishAnalysedCatchAll"),
    dynamicObj("domainMetadata")
  ))

  def usageRightsMapping(name: String): ObjectField = nonDynamicObjectField(name).copy(properties = Seq(
    keywordField("category"),
    standardAnalysed("restrictions"),
    keywordField("supplier"),
    keywordField("suppliersCollection"),
    standardAnalysed("photographer"),
    keywordField("publication"),
    keywordField("creator"),
    keywordField("licence"),
    keywordField("source"),
    keywordField("contentLink"),
    standardAnalysed("suppliers")
  ))

  def syndicationRightsPropertiesMapping(name: String): ObjectField = nonDynamicObjectField(name).copy(properties = Seq(
    keywordField("propertyCode"),
    dateField("expiresOn"),
    keywordField("value")
  ))

  def syndicationRightsListMapping(name: String) = nonDynamicObjectField(name).copy(properties = Seq(
    keywordField("rightCode"),
    booleanField("acquired"),
    syndicationRightsPropertiesMapping("properties")
  ))

  def suppliersMapping(name: String): ObjectField = nonDynamicObjectField(name).copy(properties = Seq(
    keywordField("supplierId"),
    keywordField("supplierName"),
    booleanField("prAgreement")
  ))

  def syndicationRightsMapping(name: String) = nonDynamicObjectField(name).copy(properties = Seq(
    dateField("published"),
    suppliersMapping("suppliers"),
    syndicationRightsListMapping("rights"),
    booleanField("isInferred")
  ))

  def exportsMapping(name: String) = nonDynamicObjectField(name).copy(properties = Seq(
    keywordField("id"),
    keywordField("type"),
    keywordField("author"),
    dateField("date"),
    dynamicObj("specification"),
    assetMapping("master"),
    assetMapping("assets")
  ))

  def actionDataMapping(name: String) = {
    nonDynamicObjectField(name).copy(properties = Seq(
      keywordField("author"),
      dateField("date")
    ))
  }

  /*
    val collectionMapping = withIndexName("collection", nonDynamicObj(
      "path" -> nonAnalysedList("collectionPath"),
      "pathId" -> (nonAnalyzedString ++ copyTo("collections.pathHierarchy")),
      "pathHierarchy" -> hierarchyAnalysedString,
      "description" -> nonAnalyzedString,
      "actionData" -> actionDataMapping
    ))*/
  def collectionMapping(name: String) = { // TODO withIndexName appeared to have no effect on the 1.7 index
    nonDynamicObjectField(name).copy(properties = Seq(
      nonAnalysedList("path"),
      keywordField("pathId").copy(copyTo = Seq("collections.pathHierarchy")),
      hierarchyAnalysed("pathHierarchy"),
      keywordField("description"),
      actionDataMapping("actionData")
    ))
  }

  def esInfoMapping(name: String) = nonDynamicObjectField(name).copy(properties = Seq(
    nonDynamicObjectField("migration").copy(properties = Seq(
      keywordField("migratedTo"),
      dynamicObj("failures"),
    ))
  ))

  def photoshootMapping(name: String) = {
    nonDynamicObjectField(name).copy(properties = Seq(
      keywordField("title"),
      simpleSuggester("suggest")
    ))
  }

  def userMetadataMapping(name: String) = nonDynamicObjectField(name).copy(properties = Seq(
    booleanField("archived"),
    nonAnalysedList("labels").copy(copyTo = Seq("metadata.englishAnalysedCatchAll")),
    metadataMapping("metadata"),
    usageRightsMapping("usageRights"),
    photoshootMapping("photoshoot"),
    dateField("lastModified")
  ))

  def uploadInfoMapping(name: String): ObjectField = nonDynamicObjectField(name).copy(properties = Seq(
    keywordField("filename")
  ))

  def usageReference(name: String): ObjectField = {
    nonDynamicObjectField(name).copy(properties = Seq(
      keywordField("type"),
      keywordField("uri"),
      sStemmerAnalysed("name")
    ))
  }

  def printUsageSize(name: String): ObjectField = {
    nonDynamicObjectField(name).copy(properties = Seq(
      intField("x"),
      intField("y")
    ))
  }

  def printUsageMetadata(name: String): ObjectField = {
    nonDynamicObjectField(name).copy(properties = Seq(
      keywordField("sectionName"),
      dateField("issueDate"),
      intField("pageNumber"),
      keywordField("storyName"),
      keywordField("publicationCode"),
      keywordField("publicationName"),
      intField("layoutId"),
      intField("edition"),
      printUsageSize("size"),
      keywordField("orderedBy"),
      keywordField("sectionCode"),
      keywordField("notes"),
      keywordField("source")
    ))
  }

  def digitalUsageMetadata(name: String): ObjectField = nonDynamicObjectField(name).copy(properties = Seq(
    keywordField("webTitle"),
    keywordField("webUrl"),
    keywordField("sectionId"),
    keywordField("composerUrl")
  ))

  def syndicationUsageMetadata(name: String): ObjectField = nonDynamicObjectField(name).copy(properties = Seq(
    keywordField("partnerName")
  ))

  def frontUsageMetadata(name: String): ObjectField = nonDynamicObjectField(name).copy(properties = Seq(
    keywordField("addedBy"),
    keywordField("front")
  ))

  def downloadUsageMetadata(name: String): ObjectField = nonDynamicObjectField(name).copy(properties = Seq(
    keywordField("downloadedBy")
  ))

  def usagesMapping(name: String): NestedField = nestedField(name).copy( properties = Seq(
    keywordField("id"),
    sStemmerAnalysed("title"),
    usageReference("references"),
    KeywordField(name = "platform", copyTo = Seq("usagesPlatform")),
    keywordField("media"),
    KeywordField(name = "status", copyTo = Seq("usagesStatus")),
    dateField("dateAdded"),
    dateField("dateRemoved"),
    dateField("lastModified"),
    printUsageMetadata("printUsageMetadata"),
    digitalUsageMetadata("digitalUsageMetadata"),
    syndicationUsageMetadata("syndicationUsageMetadata"),
    frontUsageMetadata("frontUsageMetadata"),
    downloadUsageMetadata("downloadUsageMetadata")
  ))

  def leaseMapping(name: String): ObjectField = nonDynamicObjectField(name).copy(properties = Seq(
    keywordField("id"),
    keywordField("leasedBy"),
    dateField("startDate"),
    dateField("endDate"),
    keywordField("access"),
    keywordField("active"),
    sStemmerAnalysed("notes"),
    keywordField("mediaId"),
    dateField("createdAt")
  ))

  def leasesMapping(name: String): ObjectField = nonDynamicObjectField(name).copy(properties = Seq(
    leaseMapping("leases"),
    dateField("lastModified")
  ))

  def softDeletedMetadataMapping(name: String) = nonDynamicObjectField(name).copy(properties = Seq(
    dateField("deleteTime"),
    keywordField("deletedBy")
  ))

  private def nonDynamicObjectField(name: String) = ObjectField(name = name, dynamic = Some("strict"))

  private def nestedField(name: String) = NestedField(name).dynamic("strict") // ES1 include_in_parent needs to be emulated with field bby field copy_tos

  private def dynamicObj(name: String) = objectField(name).copy(dynamic = Some("true"))

  private def nonIndexedString(name: String) = textField(name).index(false)

  private def sStemmerAnalysed(name: String) = textField(name).analyzer(IndexSettings.englishSStemmerAnalyzerName)

  private def hierarchyAnalysed(name: String) = textField(name).analyzer(IndexSettings.hierarchyAnalyserName)

  private def standardAnalysed(name: String) = textField(name).analyzer("standard")

  private def simpleSuggester(name: String) = completionField(name).analyzer("simple").searchAnalyzer("simple")

  //def nonAnalysedList(indexName: String) = Json.obj("type" -> "string", "index" -> "not_analyzed", "index_name" -> indexName)
  private def nonAnalysedList(name: String) = {
    keywordField(name) // TODO index_name
  }

  private def withIndexName(indexName: String, obj: JsObject) = Json.obj("index_Name" -> indexName) ++ obj

  // TODO could have kept this bit of indirection
  //val nonAnalyzedString = Json.obj("type" -> "string", "index" -> "not_analyzed")

}
