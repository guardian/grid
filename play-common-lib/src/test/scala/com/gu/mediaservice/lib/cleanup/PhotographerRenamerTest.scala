package com.gu.mediaservice.lib.cleanup

import org.scalatest.{FunSpec, Matchers}

class PhotographerRenamerTest extends FunSpec with Matchers with MetadataHelper {

  it("should rename a known misspelled byline") {
    val metadata = createImageMetadata("byline" -> "Czarek Sokolowski")
    val cleanedMetadata = PhotographerRenamer.clean(metadata)
    cleanedMetadata.byline should be (Some("Czarek Sokołowski"))  
  }

  it("should not rename an unknown byline") {
    val metadata = createImageMetadata("byline" -> "Sam Cutler")
    val cleanedMetadata = PhotographerRenamer.clean(metadata)
    cleanedMetadata.byline should be (Some("Sam Cutler"))  
  }

  it("should leave byline alone if the match is not exact") {
    val metadata = createImageMetadata("byline" -> "Czarek Sokolowski/Agencja Gazeta")
    val cleanedMetadata = PhotographerRenamer.clean(metadata)
    cleanedMetadata.byline should be (Some("Czarek Sokolowski/Agencja Gazeta"))  
  }

}
