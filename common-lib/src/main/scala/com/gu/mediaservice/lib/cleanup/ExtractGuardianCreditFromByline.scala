package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

/**
  * Super Guardian-specific - really only important for old pictures.
  */
object ExtractGuardianCreditFromByline extends MetadataCleaner {

  val BylineForTheGuardian = """(?i)(.+) for the (Guardian|Observer)[.]?""".r
  val BylineForTheTrunc = """(?i)(.+) for the (.+)[.]?""".r

  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.byline match {
    case Some(BylineForTheGuardian(byline, org)) =>
      val orgName = org.toLowerCase.capitalize
      metadata.copy(byline = Some(byline), credit = Some(s"The $orgName"))
    // Catch truncated bylines (IPTC allows 32 chars only)
    case Some(field @ BylineForTheTrunc(byline, org)) if isThe("Guardian", org) && field.length == 31 =>
      metadata.copy(byline = Some(byline), credit = Some(s"The Guardian"))
    case Some(field @ BylineForTheTrunc(byline, org)) if isThe("Observer", org) && field.length == 31 =>
      metadata.copy(byline = Some(byline), credit = Some(s"The Observer"))
    case _ => metadata
  }

  private def isThe(s: String, full: String) = s.toLowerCase.startsWith(full.toLowerCase)
}
