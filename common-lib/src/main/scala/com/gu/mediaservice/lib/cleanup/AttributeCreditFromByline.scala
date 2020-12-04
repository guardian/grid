package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

/**
  * A generally useful cleaner that assigns credits based on bylines.
  * TODO: Make this more usefully configurable from config or similar?
  * @param bylines
  * @param credit
  */
case class AttributeCreditFromByline(bylines: List[String], credit: String) extends MetadataCleaner {

  val lowercaseBylines = bylines.map(_.toLowerCase)

  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.byline match {
    case Some(byline) if lowercaseBylines.contains(byline.toLowerCase) => metadata.copy(credit = Some(credit))
    case _ => metadata
  }

  override def description: String = s"AttributeCreditFromByline($credit)"
}

object AttributeCreditFromByline {
  def fromCreditBylineMap(creditBylineMap: Map[String, List[String]]): ImageProcessor = {
    ImageProcessor.compose("AttributeCreditFromBylines", creditBylineMap.map { case (credit, bylines) =>
      AttributeCreditFromByline(bylines, credit)
    }.toSeq:_*)
  }
}
