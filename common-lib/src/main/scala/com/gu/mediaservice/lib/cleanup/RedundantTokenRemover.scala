package com.gu.mediaservice.lib.cleanup
import com.gu.mediaservice.model.ImageMetadata

/**
  * Possibly generic cleaner that removes common tokens from byline/credit that are meaningless. Will never leave the credit empty.
  */
object RedundantTokenRemover extends MetadataCleaner {
  val toRemove = List(
    "Handout",
    "Handout .",
    "HANDOUT",
    "HO",
    "HO HANDOUT",
    "Pool",
    "POOL",
    "POOL New",
    "STRINGER",
    "stringer",
    "Stringer",
    "STR",
    "-",
    "UNCREDITED",
    "Uncredited",
    "uncredited",
    "XXSTRINGERXX xxxxx",
    "AFP Contributor#AFP"
  )

  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.copy(
    byline = metadata.byline.map(removeHandoutTokens).filter(_.trim.nonEmpty).map(_.trim),
    credit = metadata.credit.map(removeHandoutTokens).flatMap { c =>
      if (c.isEmpty) {
        metadata.credit.flatMap(c => c.split(" via |/").lastOption)
      } else {
        Some(c)
      }
    }.map(_.trim),
  )

  def removeHandoutTokens(text: String): String = {
    text.split(" via |/").filter { tok =>
      val trimmedToken = tok.trim
      !toRemove.contains(trimmedToken)
    }.mkString("/")
  }
}
