package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

object StripBylineFromCredit extends MetadataCleaner {

  override def clean(metadata: ImageMetadata): ImageMetadata = (metadata.credit, metadata.byline) match {
    case (Some(credit), Some(byline)) => metadata.copy(credit = Some(stripBylinePrefix(credit, byline)))
    case _ => metadata
  }

  def stripBylinePrefix(credit: String, byline: String): String = (tokenise(credit), tokenise(byline)) match {
    // If byline is a single token and a prefix of credit, strip from credit.
    // Strip recursively in case byline is present in credit multiple times.
    // TODO: make the tail nil check smarter
    case (headC :: tailC, b :: Nil) if headC.toLowerCase == b.toLowerCase && !tailC.isEmpty => stripBylinePrefix(tailC.mkString("/"), b)
    // Else leave credit as-is
    case _ => credit
  }

  def tokenise(str: String): List[String] = str.split("/").toList
}
