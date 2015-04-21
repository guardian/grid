package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.{FileMetadata, ImageMetadata}

trait BaseMetadataCleaner {
  // Extended method with fileMetadata passed in for the few cleaners that need it
  def clean(metadata: ImageMetadata, fileMetadata: FileMetadata): ImageMetadata
}

trait MetadataCleaner extends BaseMetadataCleaner {
  def clean(metadata: ImageMetadata, fileMetadata: FileMetadata): ImageMetadata = clean(metadata)

  def clean(metadata: ImageMetadata): ImageMetadata
}

class MetadataCleaners(creditBylineMap: Map[String, List[String]]) {

  val attrCreditFromBylineCleaners = creditBylineMap.map { case (credit, bylines) =>
    AttributeCreditFromByline(bylines, credit)
  }

  val allCleaners: List[BaseMetadataCleaner] = List(
    CleanRubbishLocation,
    StripCopyrightPrefix,
    UseCanonicalGuardianCredit,
    ExtractGuardianCreditFromByline
  ) ++ attrCreditFromBylineCleaners ++ List(
    StripBylineFromCredit,
    CountryCode,
    CapitaliseByline,
    CapitaliseCountry,
    CapitaliseState,
    CapitaliseCity,
    CapitaliseSubLocation,
    DropRedundantTitle
  ) ++ SupplierParsers.all

  def clean(inputMetadata: ImageMetadata, fileMetadata: FileMetadata): ImageMetadata =
    allCleaners.foldLeft(inputMetadata) {
      case (metadata, cleaner) => cleaner.clean(metadata, fileMetadata)
    }
}

// By vague order of importance:

// TODO: strip location+date prefix from description
// TODO: strip credit suffix from description
// TODO: strip (extract?) country + tags suffix from description

// TODO: strip (?) numbers or crappy acronyms as byline
// TODO: multiple country names (SWITZERLAND SCHWEIZ SUISSE, HKG, CHN) to clean name

// TODO: ignore crappy "keywords" (:rel:d:bm:LM1EAAO112401)

// TODO: unique keywords

// Ingested metadata:

// TODO: record Date Created or Date/Time Original
// TODO: ignore Unknown tags from fileMetadata

// TODO: artist (vs byline)?
