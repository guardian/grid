package lib.elasticsearch


trait ImageFields {

  def identifierField(field: String)  = s"identifiers.$field"
  def metadataField(field: String)    = s"metadata.$field"
  def editsField(field: String)       = s"userMetadata.$field"
  def usageRightsField(field: String) = s"usageRights.$field"

}
