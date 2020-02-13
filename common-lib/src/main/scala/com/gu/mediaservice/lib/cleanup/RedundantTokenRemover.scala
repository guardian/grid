package com.gu.mediaservice.lib.cleanup
import com.gu.mediaservice.model.ImageMetadata

object RedundantTokenRemover extends MetadataCleaner {
  val toRemove = List(
    "Handout",
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
    "uncreadited",
    "XXSTRINGERXX xxxxx"
  )

  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.copy(
    byline = metadata.byline.map(removeHandoutTokens).filter(_.trim.nonEmpty),
    credit = metadata.credit.map(removeHandoutTokens).flatMap { c =>
      if (c.isEmpty) {
        metadata.credit.flatMap(c => c.split("/").lastOption)
      } else {
        Some(c)
      }
    },
  )

  def removeHandoutTokens(text: String): String = {
    text.split("/").filter { tok =>
      val trimmedToken = tok.trim
      !toRemove.contains(trimmedToken)
    }.mkString("/")
  }
}
