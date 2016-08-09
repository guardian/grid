package com.gu.mediaservice.lib

object FeatureToggle {
  val defaultSwitchMap: Map[String, Boolean] = Map(
    "cloudfront-signing" -> true,
    "usage-quota-ui" -> true
  )

  def get(id: String): Boolean =
    defaultSwitchMap.get(id).getOrElse(false)
}
