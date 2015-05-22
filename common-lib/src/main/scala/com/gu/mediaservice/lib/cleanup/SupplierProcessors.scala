package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.{Agency, Image}


trait ImageProcessor {
  def apply(image: Image): Image
}

object SupplierProcessors {
  val all: List[ImageProcessor] = List(
    AapParser,
    ActionImagesParser,
    AlamyParser,
    ApParser,
    BarcroftParser,
    CorbisParser,
    EpaParser,
    GettyParser,
    PaParser,
    ReutersParser,
    RexParser,
    AddAgencyCategory
  )

  def process(image: Image): Image =
    all.foldLeft(image) { case (im, processor) => processor(im) }
}


object AapParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    case Some("AAPIMAGE") | Some("AAP IMAGE") => image.copy(
      usageRights = image.usageRights.copy(supplier = Some("AAP")),
      metadata    = image.metadata.copy(credit = Some("AAP"))
    )
    case _ => image
  }
}

object ActionImagesParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    case Some("Action Images") => image.copy(
      usageRights = image.usageRights.copy(supplier = Some("Action Images"))
    )
    case _ => image
  }
}

object AlamyParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    case Some("Alamy") => image.copy(
      usageRights = image.usageRights.copy(supplier = Some("Alamy"))
    )
    case _ => image
  }
}

object ApParser extends ImageProcessor {
  val InvisionFor = "^invision for (.+)".r
  val PersonInvisionAp = "(.+)\\s*/invision/ap$".r

  def apply(image: Image): Image = image.metadata.credit.map(_.toLowerCase) match {
    case Some("ap") | Some("associated press") => image.copy(
      usageRights = image.usageRights.copy(supplier = Some("AP")),
      metadata    = image.metadata.copy(credit = Some("AP"))
    )
    case Some("invision") | Some("invision/ap") |
         Some(InvisionFor(_)) | Some(PersonInvisionAp(_)) => image.copy(
      usageRights = image.usageRights.copy(supplier = Some("AP"), suppliersCollection = Some("Invision"))
    )
    case _ => image
  }
}

object BarcroftParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    // TODO: store barcroft office somewhere?
    case Some("Barcroft Media") | Some("Barcroft India") | Some("Barcroft USA") | Some("Barcroft Cars") => image.copy(
      usageRights = image.usageRights.copy(supplier = Some("Barcroft Media"))
    )
    case _ => image
  }
}

object CorbisParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.source match {
    case Some("Corbis") => image.copy(
      usageRights = image.usageRights.copy(supplier = Some("Corbis"))
    )
    case _ => image
  }
}

object EpaParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    case Some("EPA") => image.copy(
      usageRights = image.usageRights.copy(supplier = Some("EPA"))
    )
    case _ => image
  }
}

object GettyParser extends ImageProcessor {
  def apply(image: Image): Image = image.fileMetadata.getty.isEmpty match {
    // Only images supplied by Getty have getty fileMetadata
    case false => image.copy(
      usageRights = image.usageRights.copy(supplier = Some("Getty Images"), suppliersCollection = image.metadata.source)
    )
    case true => image
  }
}

object PaParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    case Some("PA") => image.copy(
      usageRights = image.usageRights.copy(supplier = Some("PA"))
    )
    case _ => image
  }
}

object ReutersParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    // Reuters and other misspellings
    // TODO: use case-insensitive matching instead once credit is no longer indexed as case-sensitive
    case Some("REUTERS") | Some("Reuters") | Some("RETUERS") | Some("REUTERS/") => image.copy(
      usageRights = image.usageRights.copy(supplier = Some("Reuters")),
      metadata = image.metadata.copy(credit = Some("Reuters"))
    )
    // Others via Reuters
    case Some("USA Today Sports") | Some("TT NEWS AGENCY") => image.copy(
      usageRights = image.usageRights.copy(supplier = Some("Reuters"))
    )
    case _ => image
  }
}

object RexParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.source match {
    // TODO: cleanup byline/credit
    case Some("Rex Features") => image.copy(
      usageRights = image.usageRights.copy(supplier = Some("Rex Features"))
    )
    case _ => image
  }
}

object AddAgencyCategory extends ImageProcessor {
  // TODO: Hmmm. Better way of doing this?
  def apply(image: Image): Image =
    isAgency(image).map(addAgency).getOrElse(image)

  def addAgency(image: Image): Image =
    image.copy(usageRights = image.usageRights.copy(category = Some(Agency)))

  def isAgency(image: Image): Option[Image] = image.usageRights.supplier.map(s => image)
}
