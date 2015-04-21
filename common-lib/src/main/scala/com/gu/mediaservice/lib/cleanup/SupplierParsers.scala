package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.{FileMetadata, ImageMetadata}

object SupplierParsers {
  val all = List(
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
    RexParser
  )

}


object AapParser extends MetadataCleaner {
  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.credit match {
    case Some("AAPIMAGE") | Some("AAP IMAGE") => metadata.copy(supplier = Some("AAP"), credit = Some("AAP"))
    case _ => metadata
  }
}

object ActionImagesParser extends MetadataCleaner {
  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.credit match {
    case Some("Action Images") => metadata.copy(supplier = Some("Action Images"))
    case _ => metadata
  }
}

object AlamyParser extends MetadataCleaner {
  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.credit match {
    case Some("Alamy") => metadata.copy(supplier = Some("Alamy"))
    case _ => metadata
  }
}

object ApParser extends MetadataCleaner {
  val InvisionFor = "^Invision for (.+)".r
  val PersonInvisionAp = "(.+)\\s*/Invision/AP$".r

  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.credit match {
    case Some("AP") => metadata.copy(supplier = Some("AP"))
    case Some("Invision") | Some("Invision/AP") | Some("INVISION/AP") | Some(InvisionFor(_)) | Some(PersonInvisionAp(_)) =>
      metadata.copy(supplier = Some("AP"), collection = Some("Invision"))
    case _ => metadata
  }
}

object BarcroftParser extends MetadataCleaner {
  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.credit match {
    // TODO: store barcroft office somewhere?
    case Some("Barcroft Media") | Some("Barcroft India") | Some("Barcroft USA") | Some("Barcroft Cars") =>
      metadata.copy(supplier = Some("Barcroft Media"))
    case _ => metadata
  }
}

object CorbisParser extends MetadataCleaner {
  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.source match {
    case Some("Corbis") => metadata.copy(supplier = Some("Corbis"))
    case _ => metadata
  }
}

object EpaParser extends MetadataCleaner {
  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.credit match {
    case Some("EPA") => metadata.copy(supplier = Some("EPA"))
    case _ => metadata
  }
}

object GettyParser extends BaseMetadataCleaner {
  override def clean(metadata: ImageMetadata, fileMetadata: FileMetadata): ImageMetadata = fileMetadata.getty.isEmpty match {
    case false => metadata.copy(supplier = Some("Getty Images"), collection = metadata.source)
    case true  => metadata
  }
}

object PaParser extends MetadataCleaner {
  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.credit match {
    case Some("PA") => metadata.copy(supplier = Some("PA"))
    case _ => metadata
  }
}

object ReutersParser extends MetadataCleaner {
  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.credit match {
    // Reuters and other misspellings
    case Some("REUTERS") | Some("Reuters") | Some("RETUERS") | Some("REUTERS/") =>
      metadata.copy(supplier = Some("Reuters"), credit = Some("Reuters"))
    // Others via Reuters
    case Some("USA Today Sports") | Some("TT NEWS AGENCY") =>
      metadata.copy(supplier = Some("Reuters"))
    case _ => metadata
  }
}

object RexParser extends MetadataCleaner {
  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.source match {
    // TODO: cleanup byline/credit
    case Some("Rex Features") => metadata.copy(supplier = Some("Rex Features"))
    case _ => metadata
  }
}
