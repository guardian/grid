package com.gu.mediaservice.lib.elasticsearch

trait ImageFields {
  // TODO: share with mappings
  val metadataFields = List(
    "dateTaken",
    "description",
    "byline",
    "bylineTitle",
    "title",
    "credit",
    "creditUri",
    "copyright",
    "copyrightNotice",
    "suppliersReference",
    "subjects",
    "source",
    "specialInstructions",
    "keywords",
    "subLocation",
    "city",
    "state",
    "country"
  )

  val usageRightsFields = List(
    "category",
    "restrictions",
    "supplier",
    "suppliersCollection",
    "photographer",
    "publication"
  )

  val editsFields = List("archived", "labels")
  val collectionsFields = List("path", "pathId", "pathHierarchy")
  val usagesFields = List("status", "platform")

  def identifierField(field: String)  = s"identifiers.$field"
  def metadataField(field: String)    = s"metadata.$field"
  def editsField(field: String)       = s"userMetadata.$field"
  def usageRightsField(field: String) = s"usageRights.$field"
  def collectionsField(field: String) = s"collections.$field"
  def usagesField(field: String)      = s"usages.$field"

  val aliases = Map(
    "crops"     -> "exports",
    "croppedBy" -> "exports.author",
    "filename"  -> "uploadInfo.filename"
  )

  def getFieldPath(field: String) = field match {
    case f if metadataFields.contains(f)    => metadataField(f)
    case f if usageRightsFields.contains(f) => usageRightsField(f)
    case f if editsFields.contains(f)       => editsField(f)
    case f if collectionsFields.contains(f) => collectionsField(f)
    case f if usagesFields.contains(f)      => usagesField(f)
    case f => aliases.getOrElse(f, f)
  }

}
