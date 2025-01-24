package com.gu.mediaservice.lib.cleanup

import org.apache.pekko.actor.ActorSystem
import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

/**
  * Resources that can be injected into a dynamically loaded ImageProcessor
  */
case class ImageProcessorResources(commonConfiguration: CommonConfig, actorSystem: ActorSystem)
