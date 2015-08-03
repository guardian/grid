package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.{Agency, Image, StaffPhotographer, ContractPhotographer, CommissionedPhotographer}
import com.gu.mediaservice.lib.config.PhotographersList
import com.gu.mediaservice.lib.config.MetadataConfig.{staffPhotographers, contractedPhotographers}

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
    PhotographerParser
  )

  def process(image: Image): Image =
    all.foldLeft(image) { case (im, processor) => processor(im) }
}

object PhotographerParser extends ImageProcessor {
  def apply(image: Image): Image = {
    image.metadata.byline.map { byline =>
      (
        byline,
        image.metadata.credit.map(_.toLowerCase),
        PhotographersList.getPublication(staffPhotographers, byline),
        PhotographersList.getPublication(contractedPhotographers, byline)
      ) match {
        // staff photographer
        case (byline, credit, Some(publication), _) => image.copy(
          usageRights = StaffPhotographer(byline, publication),
          metadata    = image.metadata.copy(credit = Some(publication))
        )

        // contracted photographer
        case (byline, credit, None, Some(publication)) => image.copy(
          usageRights = ContractPhotographer(byline, publication),
          metadata    = image.metadata.copy(credit = Some(publication))
        )

        // commissioned photographer
        case (byline, Some("the guardian"), None, None) => image.copy(
          usageRights = CommissionedPhotographer(byline, "The Guardian")
        )
        case (byline, Some("the observer"), None, None) => image.copy(
          usageRights = CommissionedPhotographer(byline, "The Observer")
        )

        case _ => image
      }
    }
  }.getOrElse(image)
}


object AapParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    case Some("AAPIMAGE") | Some("AAP IMAGE") => image.copy(
      usageRights = Agency("AAP"),
      metadata    = image.metadata.copy(credit = Some("AAP"))
    )
    case _ => image
  }
}

object ActionImagesParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    case Some("Action Images") => image.copy(
      usageRights = Agency("Action Images")
    )
    case _ => image
  }
}

object AlamyParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    case Some("Alamy") => image.copy(
      usageRights = Agency("Alamy")
    )
    case _ => image
  }
}

object ApParser extends ImageProcessor {
  val InvisionFor = "^invision for (.+)".r
  val PersonInvisionAp = "(.+)\\s*/invision/ap$".r

  def apply(image: Image): Image = image.metadata.credit.map(_.toLowerCase) match {
    case Some("ap") | Some("associated press") => image.copy(
      usageRights = Agency("AP"),
      metadata    = image.metadata.copy(credit = Some("AP"))
    )
    case Some("invision") | Some("invision/ap") |
         Some(InvisionFor(_)) | Some(PersonInvisionAp(_)) => image.copy(
      usageRights = Agency("AP", Some("Invision"))
    )
    case _ => image
  }
}

object BarcroftParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    // TODO: store barcroft office somewhere?
    case Some("Barcroft Media") | Some("Barcroft India") | Some("Barcroft USA") | Some("Barcroft Cars") => image.copy(
      usageRights = Agency("Barcroft Media")
    )
    case _ => image
  }
}

object CorbisParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.source match {
    case Some("Corbis") => image.copy(
      usageRights = Agency("Corbis")
    )
    case _ => image
  }
}

object EpaParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    case Some("EPA") => image.copy(
      usageRights = Agency("EPA")
    )
    case _ => image
  }
}

object GettyParser extends ImageProcessor {
  def apply(image: Image): Image = image.fileMetadata.getty.isEmpty match {
    // Only images supplied by Getty have getty fileMetadata
    case false => image.copy(
      usageRights = Agency("Getty Images", suppliersCollection = image.metadata.source),
      // Set a default "credit" for when Getty is too lazy to provide one
      metadata    = image.metadata.copy(credit = Some(image.metadata.credit.getOrElse("Getty Images")))
    )
    case true => image
  }
}

object PaParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit.map(_.toLowerCase) match {
    case Some("pa") => image.copy(
      usageRights = Agency("PA")
    )

    case Some("pa wire") =>image.copy(
      metadata = image.metadata.copy(credit = Some("PA WIRE")),
      usageRights = Agency("PA")
    )

    case _ => image
  }
}

object ReutersParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    // Reuters and other misspellings
    // TODO: use case-insensitive matching instead once credit is no longer indexed as case-sensitive
    case Some("REUTERS") | Some("Reuters") | Some("RETUERS") | Some("REUTERS/") => image.copy(
      usageRights = Agency("Reuters"),
      metadata = image.metadata.copy(credit = Some("Reuters"))
    )
    // Others via Reuters
    case Some("USA Today Sports") | Some("TT NEWS AGENCY") => image.copy(
      usageRights = Agency("Reuters")
    )
    case _ => image
  }
}

object RexParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.source match {
    // TODO: cleanup byline/credit
    case Some("Rex Features") => image.copy(
      usageRights = Agency("Rex Features")
    )
    case _ => image
  }
}
