package com.gu.mediaservice.picdarexport.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata


object MetadataCleaners {

  def cleanPicdarArtifacts(picdarMetadata: ImageMetadata, referenceMetadata: ImageMetadata): ImageMetadata = {
    val keywords = referenceMetadata.keywords
    picdarMetadata.copy(description = picdarMetadata.description.flatMap(excludesLinesContaining(keywords)))
  }

  private def excludesLinesContaining(keywords: List[String])(description: String): Option[String] = {
    val descriptionLines = description.split("\n")
    val descriptionLinesNoKeywords = descriptionLines.filterNot(keywords.contains)
    val descriptionNoKeywords = descriptionLinesNoKeywords.mkString("\n")
    Option(descriptionNoKeywords).filterNot(_.isEmpty)
  }


  // FIXME: copyright vs credit?

  def getNecessaryOverrides(current: ImageMetadata, overrides: ImageMetadata): Option[ImageMetadata] = {
    val necessaryOverrides = overrides.copy(
      title              = overrides.title.filterNot(Some(_) == current.title),
      description        = overrides.description.filterNot(Some(_) == current.description),
      copyright          = overrides.copyright.filterNot(Some(_) == current.copyright),
      byline             = overrides.byline.filterNot(Some(_) == current.byline),
      credit             = overrides.credit.filterNot(Some(_) == current.credit),
      source             = overrides.source.filterNot(Some(_) == current.source),
      suppliersReference = overrides.suppliersReference.filterNot(Some(_) == current.suppliersReference)
    )
    Some(necessaryOverrides).filterNot(emptyOverrides)
  }

  private def emptyOverrides(overrides: ImageMetadata): Boolean = {
    val overrideProps = List(
      overrides.title,
      overrides.description,
      overrides.copyright,
      overrides.byline,
      overrides.credit,
      overrides.source,
      overrides.suppliersReference
    )
    overrideProps.forall(_.isEmpty)
  }

}
