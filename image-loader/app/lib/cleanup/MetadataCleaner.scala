package lib.cleanup

import lib.Config
import lib.imaging.ImageMetadata

trait MetadataCleaner {
  def clean(metadata: ImageMetadata): ImageMetadata
}

object MetadataCleaner {

  val allCleaners = List(
    CleanRubbishLocation,
    StripCopyrightPrefix,
    UseCanonicalGuardianCredit,
    ExtractGuardianCreditFromByline,
    AttributeCreditFromByline(Config.guardianStaff, "The Guardian"),
    AttributeCreditFromByline(Config.observerStaff, "The Observer"),
    CountryCode,
    CapitaliseByline,
    CapitaliseCountry,
    CapitaliseCity,
    DropRedundantTitle
  )

  def clean(inputMetadata: ImageMetadata): ImageMetadata =
    allCleaners.foldLeft(inputMetadata) {
      case (metadata, cleaner) => cleaner.clean(metadata)
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
