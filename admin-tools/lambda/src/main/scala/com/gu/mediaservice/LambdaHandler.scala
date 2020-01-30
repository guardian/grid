package com.gu.mediaservice

import scala.concurrent.ExecutionContext.Implicits.global

class LambdaHandler {

  def handleImageProjection(mediaId: String) = {

    val cfg = ImageDataMergerConfig(
      apiKey = "TODO",
      imgLoaderApiBaseUri = "TODO",
      collectionsApiBaseUri = "TODO",
      metadataApiBaseUri = "TODO",
      cropperApiBaseUri = "TODO",
      leasesApiBaseUri = "TODO",
      usageBaseApiUri = "TODO"
    )

    val merger = new ImageDataMerger(cfg)

    val image = merger.getMergedImageData(mediaId)

    println(s"image projected \n $image")

    image
  }
}
