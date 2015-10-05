package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

object ExtractGuardianCreditFromByline extends MetadataCleaner {

  val BylineForTheGuardian = """(?i)(.+) for the (Guardian|Observer)[.]?""".r
  val BylineForTheTrunc = """(?i)(.+) for the (.+)[.]?""".r

  val GuardianPrefix = Prefix("Guardian")
  val ObserverPrefix = Prefix("Observer")

  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.byline match {
    case Some(BylineForTheGuardian(byline, org)) => {
      val orgName = org.toLowerCase.capitalize
      metadata.copy(byline = Some(byline), credit = Some(s"The $orgName"))
    }
    // Catch truncated bylines (IPTC allows 32 chars only)
    case Some(field @ BylineForTheTrunc(byline, GuardianPrefix())) if field.length == 31 => {
      metadata.copy(byline = Some(byline), credit = Some(s"The Guardian"))
    }
    case Some(field @ BylineForTheTrunc(byline, ObserverPrefix())) if field.length == 31 => {
      metadata.copy(byline = Some(byline), credit = Some(s"The Observer"))
    }
    case _ => metadata
  }
}

case class Prefix(full: String) {
  def unapplySeq(s: String): Boolean = {
    full.toLowerCase.startsWith(s.toLowerCase)
  }
}
