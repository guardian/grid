package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.lib.config.MetadataConfig
import com.gu.mediaservice.model.{Image, ImageMetadata}

trait MetadataCleaner extends ImageProcessor {
  def clean(metadata: ImageMetadata): ImageMetadata

  override def apply(image: Image): Image = image.copy(metadata = clean(image.metadata))
}

class GuardianMetadataCleaners extends MetadataCleaners(MetadataConfig.allPhotographersMap)

class MetadataCleaners(creditBylineMap: Map[String, List[String]])
  extends ComposeImageProcessors(
    CleanRubbishLocation,
    StripCopyrightPrefix,
    RedundantTokenRemover,
    BylineCreditReorganise,
    UseCanonicalGuardianCredit,
    ExtractGuardianCreditFromByline,
    AttributeCreditFromByline.fromCreditBylineMap(creditBylineMap),
    CountryCode,
    GuardianStyleByline,
    CapitaliseByline,
    InitialJoinerByline,
    CapitaliseCountry,
    CapitaliseState,
    CapitaliseCity,
    CapitaliseSubLocation,
    DropRedundantTitle,
    PhotographerRenamer
  )

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
