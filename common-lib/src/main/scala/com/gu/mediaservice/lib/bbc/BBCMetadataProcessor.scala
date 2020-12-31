package com.gu.mediaservice.lib.bbc

import com.gu.mediaservice.lib.bbc.components.BBCImageProcessorsDependencies
import com.gu.mediaservice.lib.cleanup.{ImageProcessor, MetadataCleaners}
import com.gu.mediaservice.model.Image
import play.api.Configuration

/*
BBC Metadata processor.
In order to use it, you will have to update application.conf
image.processors = [
  ...
  "com.gu.mediaservice.lib.bbc.BBCMetadataProcessor",
  ...
]
*/
class BBCMetadataProcessor(configuration: Configuration) extends ImageProcessor {

  val metadataStore = BBCImageProcessorsDependencies.metadataStore(configuration)

  override def apply(image: Image): Image = {
      val metadataConfig = metadataStore.get
      val allPhotographers = metadataConfig.allPhotographers
      val metaDataCleaner = new MetadataCleaners(allPhotographers)
      metaDataCleaner.apply(image)
  }
}
