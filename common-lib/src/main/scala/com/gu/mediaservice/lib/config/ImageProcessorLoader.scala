package com.gu.mediaservice.lib.config

import com.gu.mediaservice.lib.cleanup.{ImageProcessor, ImageProcessorResources}

object ImageProcessorLoader extends ProviderLoader[ImageProcessor, ImageProcessorResources]("image processor")
