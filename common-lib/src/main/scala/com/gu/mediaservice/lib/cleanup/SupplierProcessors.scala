package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.{Agency, Image, StaffPhotographer, ContractPhotographer}
import com.gu.mediaservice.lib.config.PhotographersList

trait ImageProcessor {
  def apply(image: Image): Image
}

object SupplierProcessors {
  val all: List[ImageProcessor] = List(
    AapParser,
    ActionImagesParser,
    AlamyParser,
    AllStarParser,
    ApParser,
    BarcroftParser,
    CorbisParser,
    EpaParser,
    GettyXmpParser,
    GettyCreditParser,
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
    image.metadata.byline.flatMap { byline =>
      PhotographersList.getPhotographer(byline).map{
        case p: StaffPhotographer => image.copy(
          usageRights = p,
          metadata    = image.metadata.copy(credit = Some(p.publication), byline = Some(p.photographer))
        )
        case p: ContractPhotographer => image.copy(
          usageRights = p,
          metadata    = image.metadata.copy(credit = p.publication, byline = Some(p.photographer))
        )
        case _ => image
      }
    }
  }.getOrElse(image)
}

object AapParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    case Some("AAPIMAGE") | Some("AAP IMAGE") | Some("AAP") => image.copy(
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
    case Some("Alamy") | Some("Alamy Stock Photo") => image.copy(
      usageRights = Agency("Alamy")
    )
    case _ => image
  }
}

object AllStarParser extends ImageProcessor {
  val SlashAllstar = """(.+)/Allstar""".r
  val AllstarSlash = """Allstar/(.+)""".r

  def apply(image: Image): Image = image.metadata.credit match {
    case Some("Allstar Picture Library") => withAllstarRights(image)(None)
    case Some(SlashAllstar(prefix))      => withAllstarRights(image)(Some(prefix))
    case Some(AllstarSlash(suffix))      => withAllstarRights(image)(Some(suffix))
    case _ => image
  }

  def withAllstarRights(image: Image) =
    (asAllstarAgency(image, _: Option[String])) andThen
      stripAllstarFromByline andThen
      stripDuplicateByline

  def asAllstarAgency(image: Image, suppliersCollection: Option[String]) = image.copy(
    usageRights = Agency("Allstar Picture Library", suppliersCollection)
  )

  def stripAllstarFromByline(image: Image) = image.copy(
    metadata = image.metadata.copy(byline = image.metadata.byline.map(stripAllstarSuffix))
  )

  def stripAllstarSuffix(byline: String): String = byline match {
    case SlashAllstar(name) => name
    case _ => byline
  }

  // If suppliersCollection same as byline, remove byline but its byline casing for suppliersCollection and credit,
  // as they otherwise tend to be in ugly uppercase
  def stripDuplicateByline(image: Image) = (image.usageRights, image.metadata.byline) match {
    case (agency @ Agency(supplier, Some(supplColl), _), Some(byline)) if supplColl.toLowerCase == byline.toLowerCase => {
      image.copy(
        usageRights = agency.copy(suppliersCollection = image.metadata.byline),
        metadata = image.metadata.copy(
          credit = image.metadata.credit.map(credit => credit.replace(supplColl, byline)),
          byline = None
        )
      )
    }
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
  def apply(image: Image): Image =
    // We search the credit and the source here as Barcroft seems to use both
    if(List(image.metadata.credit, image.metadata.source).flatten.map(_.toLowerCase).exists { s =>
      List("barcroft media", "barcroft india", "barcroft usa", "barcroft cars").contains(s)
    }) image.copy(usageRights = Agency("Barcroft Media")) else image
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

trait GettyProcessor {
  def gettyAgencyWithCollection(suppliersCollection: Option[String]) =
    Agency("Getty Images", suppliersCollection = suppliersCollection)
}

object GettyXmpParser extends ImageProcessor with GettyProcessor {
  val excludeFrom = List("newspix international")

  // Some people send over Getty XMP data, but are not affiliated with Getty
  def excludedCredit(credit: Option[String]) = credit.map(_.toLowerCase).exists(excludeFrom.contains)

  def apply(image: Image): Image = (excludedCredit(image.metadata.credit), image.fileMetadata.getty.isEmpty) match {
    // Only images supplied by Getty have getty fileMetadata
    case (false, false) => image.copy(
      usageRights = gettyAgencyWithCollection(image.metadata.source),
      // Set a default "credit" for when Getty is too lazy to provide one
      metadata    = image.metadata.copy(credit = Some(image.metadata.credit.getOrElse("Getty Images")))
    )
    case _ => image
  }
}

object GettyCreditParser extends ImageProcessor with GettyProcessor {
  val gettyCredits = List("AFP", "FilmMagic", "WireImage", "Hulton")

  val IncludesGetty = ".*Getty Images.*".r
  // Take a leap of faith as the credit may be truncated if too long...
  val ViaGetty = ".+ via Getty(?: .*)?".r
  val SlashGetty = ".+/Getty(?: .*)?".r

  def apply(image: Image): Image = image.metadata.credit match {
    case Some(IncludesGetty()) | Some(ViaGetty()) | Some(SlashGetty()) => image.copy(
       usageRights = gettyAgencyWithCollection(image.metadata.source)
    )
    case Some(credit) => knownGettyCredits(image, credit)
    case _ => image
  }

  def knownGettyCredits(image: Image, credit: String): Image =
    gettyCredits.find(_.toLowerCase == credit.toLowerCase) match {
      case collection @ Some(_) => image.copy(
        usageRights = gettyAgencyWithCollection(collection)
      )
      case _ => image
    }
}

object PaParser extends ImageProcessor {
  val paCredits = List(
    "PA",
    "PA WIRE",
    "PA Wire/PA Photos",
    "PA Wire/Press Association Images",
    "PA Archive/PA Photos",
    "PA Archive/Press Association Ima",
    "PA Archive/Press Association Images",
    "Press Association Images"
  ).map(_.toLowerCase)

  def apply(image: Image): Image = image.metadata.credit match {
    case Some(credit) if paCredits.contains(credit.toLowerCase) => image.copy(
      metadata = image.metadata.copy(credit = Some("PA")),
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
  val rexAgency = Agency("Rex Features")
  val SlashRex = ".+/ Rex Features".r


  def apply(image: Image): Image = (image.metadata.source, image.metadata.credit) match {
    // TODO: cleanup byline/credit
    case (Some("Rex Features"), _) => image.copy(usageRights = rexAgency)
    case (_, Some(SlashRex()))     => image.copy(usageRights = rexAgency)
    case _ => image
  }
}
