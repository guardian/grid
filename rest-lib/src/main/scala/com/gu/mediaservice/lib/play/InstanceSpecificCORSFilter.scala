package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.config.{CommonConfig, InstanceForRequest}
import play.api.Configuration
import play.api.mvc.{EssentialAction, EssentialFilter}
import play.filters.cors.CORSConfig.Origins
import play.filters.cors.{CORSConfig, CORSFilter}

class InstanceSpecificCORSFilter(config: CommonConfig, playConfig: Configuration) extends EssentialFilter
  with InstanceForRequest {
  override def apply(next: EssentialAction): EssentialAction = { req =>
    val instance = instanceOf(req)
    val corsConfig: CORSConfig = CORSConfig.fromConfiguration(playConfig).copy(
      allowedOrigins = Origins.Matching(config.services.corsAllowedDomains(instance))
    )
    new CORSFilter(corsConfig = corsConfig).apply(next).apply(req)
  }
}
