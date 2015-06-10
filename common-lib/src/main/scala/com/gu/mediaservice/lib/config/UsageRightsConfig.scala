package com.gu.mediaservice.lib.config

import com.gu.mediaservice.model._

object UsageRightsConfig {

  val categoryCosts: Map[UsageRightsCategory, Cost] = Map(
    Handout         -> Free,
    Screengrab      -> Free,
    PrImage         -> Conditional,
    GuardianWitness -> Conditional,
    SocialMedia     -> Conditional,
    Obituary        -> Conditional
  )

}
