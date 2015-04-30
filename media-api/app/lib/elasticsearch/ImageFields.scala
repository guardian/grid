package lib.elasticsearch


trait ImageFields {

  def metadataField(field: String) = s"metadata.$field"
  def editsField(field: String)    = s"userMetadata.$field"

}
