package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

object StripBylineFromCredit extends MetadataCleaner {

  override def clean(metadata: ImageMetadata): ImageMetadata = (metadata.credit, metadata.byline) match {
    case (Some(credit), Some(byline)) => {
      val (c, b) = stripBylinePrefix(credit, byline)
      metadata.copy(credit = Some(c), byline = Some(b))
    }
    case _ => metadata
  }

  def stripBylinePrefix(credit: String, byline: String): (String, String) = (tokenise(credit), tokenise(byline)) match {
    // Fields equal, but too few tokens to guarantee first one is byline (e.g. both "Startraks Photo/REX")
    case (c, b) if c == b && c.size < 3 => (credit, byline)
    // Fields equal or byline prefix of credit, with enough tokens to assume
    // the first token is the byline (e.g. "Kieran McManus/BPI/REX").
    // Recursively strip byline prefix in case it appears multiple times (I know, right?).
    case (c, b) if normalise(c).startsWith(normalise(b)) => stripBylinePrefix(c.tail.mkString("/"), b.head)
    // Else leave fields as they are
    case _ => (credit, byline)
  }

  // Note: use lists so Lists can be compared
  def tokenise(str: String): List[String] = str.split("/").toList

  def normalise(list: List[String]): List[String] = list.map(normalise)
  def normalise(str: String): String = str.toLowerCase
}
