package com.gu.mediaservice.lib

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
    "suppliersReference",
    "subjects",
    "source",
    "specialInstructions",
    "keywords",
    "subLocation",
    "city",
    "state",
    "country",
    "peopleInImage"
  )

  val sourceFields = List("mimeType")

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
  val usagesFields = List("status", "platform", "dateAdded")

  def identifierField(field: String)  = s"identifiers.$field"
  def metadataField(field: String)    = s"metadata.$field"
  def editsField(field: String)       = s"userMetadata.$field"
  def usageRightsField(field: String) = s"usageRights.$field"
  def collectionsField(field: String) = s"collections.$field"
  def usagesField(field: String)      = s"usages.$field"
  def sourceField(field: String)      = s"source.$field"
  def photoshootField(field: String) = editsField(s"photoshoot.$field")

  val aliases = Map(
    "crops"     -> "exports",
    "croppedBy" -> "exports.author",
    "filename"  -> "uploadInfo.filename",
    "photoshoot"-> photoshootField("title"),
    "leases" -> "leases.leases",
    "leasedBy" -> "leases.leases.leasedBy",
    "people" -> metadataField("peopleInImage")
  )

  def getFieldPath(field: String) = field match {
    case f if metadataFields.contains(f)    => metadataField(f)
    case f if usageRightsFields.contains(f) => usageRightsField(f)
    case f if editsFields.contains(f)       => editsField(f)
    case f if collectionsFields.contains(f) => collectionsField(f)
    case f if usagesFields.contains(f)      => usagesField(f)
    case f if sourceFields.contains(f)      => sourceField(f)
    case f => aliases.getOrElse(f, f)
  }

}
