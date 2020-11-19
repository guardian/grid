package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

/**
  * TODO: Split this into two cleaners?
  */
object GuardianStyleByline extends MetadataCleaner {
  override def clean(metadata: ImageMetadata): ImageMetadata = {
    metadata.copy(
      byline = metadata.byline.map(applyCleaners)
    )
  }

  private def applyCleaners(byline: String): String =  {
    val curly = replaceStraightQuoteWithCurly(byline)
    cleanInitials(curly)
  }

  private def replaceStraightQuoteWithCurly(byline: String): String = {
    byline.replace("'", "’")
  }

  // Guardian style guide says there shoulnd't be full stops after intials
  private def cleanInitials(byline: String): String = {
    byline.replaceAll("\\b(\\w)\\.(?:\\s|\\b|$)", "$1 ").trim
  }

}
