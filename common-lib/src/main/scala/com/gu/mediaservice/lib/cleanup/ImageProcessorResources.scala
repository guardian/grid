package com.gu.mediaservice.lib.cleanup

import akka.actor.ActorSystem
import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

/**
  * Resources that can be injected into a dynamically loaded ImageProcessor
  */
trait ImageProcessorResources {
  def processorConfiguration: Configuration
  def commonConfiguration: CommonConfig
  def actorSystem: ActorSystem
}
