package lib.validation

import lib.imaging.ImageMetadata

object MetadataValidator {

  // TODO: we may want to return the list of all errors rather than the first?
  def validate(metadata: ImageMetadata) {
    requiredProperty(metadata.description, "description")
    requiredProperty(metadata.credit,      "credit")
  }

  def requiredProperty(propertyRef: Option[String], propertyName: String) =
    if (propertyRef.isEmpty) throw MissingMetadata(propertyName)

}

case class MissingMetadata(property: String) extends Throwable(s"Image metadata missing: $property")

