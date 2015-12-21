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

  def identifierField(field: String)  = s"identifiers.$field"
  def metadataField(field: String)    = s"metadata.$field"
  def editsField(field: String)       = s"userMetadata.$field"
  def usageRightsField(field: String) = s"usageRights.$field"

  def getFieldPath(field: String) = field match {
    case f if metadataFields.contains(f)    => metadataField(f)
    case f if usageRightsFields.contains(f) => usageRightsField(f)
    case f if editsFields.contains(f)       => editsField(f)
    case f => f
  }

}
