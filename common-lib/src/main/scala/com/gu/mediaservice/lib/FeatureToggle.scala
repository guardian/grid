package com.gu.mediaservice.lib

object FeatureToggle {
  val defaultSwitchMap: Map[String, Boolean] = Map(
    "usage-quota-ui" -> true
  )

  def get(id: String): Boolean =
    defaultSwitchMap.get(id).getOrElse(false)
}
