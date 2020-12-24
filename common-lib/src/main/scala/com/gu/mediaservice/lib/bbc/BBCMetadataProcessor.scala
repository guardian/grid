package com.gu.mediaservice.lib.bbc

import com.gu.mediaservice.lib.bbc.components.BBCImageProcessorsDependencies
import com.gu.mediaservice.lib.cleanup.{ImageProcessor, MetadataCleaners}
import com.gu.mediaservice.model.Image
import play.api.Configuration


class BBCMetadataProcessor(configuration: Configuration) extends ImageProcessor {

  val metadataStore = BBCImageProcessorsDependencies.metadataStore(configuration)

  override def apply(image: Image): Image = {
      val metadataConfig = metadataStore.get
      val allPhotographers = metadataConfig.allPhotographers
      val metaDataCleaner = new MetadataCleaners(allPhotographers)
      metaDataCleaner.apply(image)
  }
}
