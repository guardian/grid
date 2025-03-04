package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.Image


// Note this is a Processor, not a Cleaner!
// This really ought to live in the ImageMetadataConverter, but unfortunately
// that cannot be configured to behave differently per organisation
object InsertGuardianImageType extends ImageProcessor with GridLogging {

  override def apply(image: Image): Image = {
    image.fileMetadata.readXmpHeadStringProp("Iptc4xmpExt:DigitalSourceType") match {
      case Some(dst) =>
        val imageType = toImageType(dst)
        val metadata = image.metadata.copy(imageType = imageType)
        image.copy(metadata = metadata)
      case None => image
    }
  }

  def toImageType(digitalSourceType: String): Option[String] = {
    val Photograph = Some("Photograph")
    val Illustration = Some("Illustration")
    val Composite = Some("Composite")
    // https://cv.iptc.org/newscodes/digitalsourcetype/
    digitalSourceType match {
      // Digital capture sampled from real life
      case DigitalSourceType("digitalCapture") => Photograph
      // Multi-frame computational capture sampled from real life
      case DigitalSourceType("computationalCapture") => Photograph
      // Digitised from a transparent negative
      case DigitalSourceType("negativeFilm") => Photograph
      // Digitised from a transparent positive
      case DigitalSourceType("positiveFilm") => Photograph
      // Digitised from a non-transparent medium
      case DigitalSourceType("print") => None
      // RETIRED Original media with minor human edits
      case DigitalSourceType("minorHumanEdits") => None
      // Human-edited media
      case DigitalSourceType("humanEdits") => None
      // Edited using Generative AI
      case DigitalSourceType("compositeWithTrainedAlgorithmicMedia") => Illustration
      // Algorithmically-altered media
      case DigitalSourceType("algorithmicallyEnhanced") => Illustration
      // RETIRED The digital image was created by computer software
      case DigitalSourceType("softwareImage") => Illustration
      // RETIRED Media created by a human using digital tools
      case DigitalSourceType("digitalArt") => Illustration
      // Media created by a human using non-generative tools
      case DigitalSourceType("digitalCreation") => Illustration
      // Digital media representation of data via human programming or creativity
      case DigitalSourceType("dataDrivenMedia") => Illustration
      // Created using Generative AI
      case DigitalSourceType("trainedAlgorithmicMedia") => Illustration
      // Media created purely by an algorithm not based on any sampled training data
      case DigitalSourceType("algorithmicMedia") => Illustration
      // A capture of the contents of the screen of a computer or mobile device
      case DigitalSourceType("screenCapture") => Illustration
      // Live recording of virtual event based on Generative AI and/or captured elements
      case DigitalSourceType("virtualRecording") => None
      // Mix or composite of several elements, any of which may or may not be generative AI
      case DigitalSourceType("composite") => Composite
      // Mix or composite of several elements that are all captures of real life
      case DigitalSourceType("compositeCapture") => Composite
      // Mix or composite of several elements, at least one of which is Generative AI
      case DigitalSourceType("compositeSynthetic") => Illustration
      // unknown
      case other =>
        logger.warn(s"Unexpected Iptc4xmpExt:DigitalSourceType value: $other. Consider adding a case for this value to DigitalSourceType.scala")
        None
    }
  }
}


object DigitalSourceType {
  def unapply(name: String): Option[String] = {
    name match {
      case s"http://cv.iptc.org/newscodes/digitalsourcetype/$value" =>
        Some(value)
      // I'm pretty sure https is off-spec as a value here, but it's what Google is using so 🤷
      case s"https://cv.iptc.org/newscodes/digitalsourcetype/$value" =>
        Some(value)
      case _ => None
    }
  }
}
