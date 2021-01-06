package com.gu.mediaservice.lib.bbc

import com.gu.mediaservice.lib.bbc.components.{BBCDependenciesConfig, BBCImageProcessorsDependencies}
import com.gu.mediaservice.lib.cleanup.{ImageProcessor, ImageProcessorResources, MetadataCleaners}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model.Image

/*
BBC Metadata processor.
In order to use it, you will have to update application.conf
image.processors = [
  ...
  "com.gu.mediaservice.lib.bbc.BBCMetadataProcessor",
  ...
]
*/
class BBCMetadataProcessor(resources: ImageProcessorResources) extends ImageProcessor {

  val config = BBCDependenciesConfig(resources)
  val metadataStore = BBCImageProcessorsDependencies.metadataStore(config)

  override def apply(image: Image): Image = {
      val metadataConfig = metadataStore.get
      val allPhotographers = metadataConfig.allPhotographers
      val metaDataCleaner = new MetadataCleaners(allPhotographers)
      metaDataCleaner.apply(image)
  }

  override def description: String = "BBC Metadata Processor"
}
