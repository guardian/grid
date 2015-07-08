package com.gu.mediaservice.picdarexport.lib.cleanup

import scala.language.reflectiveCalls

import com.gu.mediaservice.lib.cleanup.MetadataCleaners
import com.gu.mediaservice.lib.config.MetadataConfig.StaffPhotographers
import com.gu.mediaservice.model.{FileMetadata, ImageMetadata}


object MetadataOverrides {

  val metadataCleaners = new MetadataCleaners(StaffPhotographers.creditBylineMap)

  def getOverrides(current: ImageMetadata, picdarOverrides: ImageMetadata): Option[ImageMetadata] = {
    // Strip any Picdar-specific metadata artifacts
    val picdarOverridesNoArtifacts = removePicdarArtifacts(current, picdarOverrides)

    // Apply the canonical cleaners to the Picdar metadata
    val cleanPicdarOverrides = metadataCleaners.clean(picdarOverridesNoArtifacts)

    // Compare resulting metadata with current and only preserve overrides that differ (if any)
    val necessaryOverrides = getNecessaryOverrides(current, cleanPicdarOverrides)

    // Apply any recovery
    necessaryOverrides.map(includeFallbackOverrides(current, _))
  }

  def includeFallbackOverrides(current: ImageMetadata, overrides: ImageMetadata): ImageMetadata = current.credit match {
    // The image has no credit, try harder to provide one as override:
    // Picdar users use the "copyright" field to hold the agency etc; if no "credit", use "copyright" as "credit"
    case None => overrides.copy(credit = overrides.credit orElse overrides.copyright)
    // If the image has a credit, leave it to the normal overrides logic
    case _    => overrides
  }


  def removePicdarArtifacts(current: ImageMetadata, picdarMetadata: ImageMetadata): ImageMetadata = {
    picdarMetadata.copy(
      // Picdar appends the keywords to the description - we strip that to recover the original description
      description = picdarMetadata.description.flatMap(excludesLinesContaining(current.keywords))
    )
  }

  private def excludesLinesContaining(keywords: List[String])(description: String): Option[String] = {
    val descriptionLines = description.split("\n")
    val descriptionLinesNoKeywords = descriptionLines.filterNot(keywords.contains)
    val descriptionNoKeywords = descriptionLinesNoKeywords.mkString("\n")
    Option(descriptionNoKeywords).filterNot(_.isEmpty)
  }


  def getNecessaryOverrides(current: ImageMetadata, overrides: ImageMetadata): Option[ImageMetadata] = {
    val necessaryOverrides = overrides.copy(
      dateTaken           = necessaryOverride(overrides.dateTaken,           current.dateTaken),
      description         = necessaryOverride(overrides.description,         current.description),
      credit              = necessaryOverride(overrides.credit,              current.credit),
      byline              = necessaryOverride(overrides.byline,              current.byline),
      bylineTitle         = necessaryOverride(overrides.bylineTitle,         current.bylineTitle),
      title               = necessaryOverride(overrides.title,               current.title),
      copyrightNotice     = necessaryOverride(overrides.copyrightNotice,     current.copyrightNotice),
      copyright           = necessaryOverride(overrides.copyright,           current.copyright),
      suppliersReference  = necessaryOverride(overrides.suppliersReference,  current.suppliersReference),
      source              = necessaryOverride(overrides.source,              current.source),
      specialInstructions = necessaryOverride(overrides.specialInstructions, current.specialInstructions),
      keywords            = if (overrides.keywords != current.keywords) overrides.keywords else List(),
      subLocation         = necessaryOverride(overrides.subLocation,         current.subLocation),
      city                = necessaryOverride(overrides.city,                current.city),
      state               = necessaryOverride(overrides.state,               current.state),
      country             = necessaryOverride(overrides.country,             current.country)
    )
    // We also filter out the copyright if it's the same as credit, since historically they filled in the
    // copyright field in Picdar to record information we store in credit
    val necessaryOverridesOptCopyright = necessaryOverrides.copy(
      copyright = necessaryOverride(necessaryOverrides.copyright, current.credit)
    )
    Some(necessaryOverridesOptCopyright).filterNot(emptyOverrides)
  }

  private def necessaryOverride[T](overrideValue: Option[T], currentValue: Option[T]): Option[T] = {
    overrideValue.filterNot(Some(_) == currentValue)
  }

  private def emptyOverrides(overrides: ImageMetadata): Boolean = {
    // Fun duck-typing magic
    val overrideProps = Seq[{ def isEmpty: Boolean }](
      overrides.dateTaken,
      overrides.description,
      overrides.credit,
      overrides.byline,
      overrides.bylineTitle,
      overrides.title,
      overrides.copyrightNotice,
      overrides.copyright,
      overrides.suppliersReference,
      overrides.source,
      overrides.specialInstructions,
      overrides.keywords,
      overrides.subLocation,
      overrides.city,
      overrides.state,
      overrides.country
    )
    overrideProps.forall(_.isEmpty)
  }

}
