package com.gu.mediaservice.lib.cleanup

import org.apache.pekko.actor.ActorSystem
import com.gu.mediaservice.lib.config.{CommonConfig, CommonConfigWithElastic}

/**
  * Resources that can be injected into a dynamically loaded ReaperEligibility implementation
  */
case class ReapableEligibiltyResources(esConf: CommonConfigWithElastic, actorSystem: ActorSystem)
