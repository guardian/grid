package com.gu.mediaservice.lib.config

import com.gu.mediaservice.model._

object UsageRightsConfig {

  val categoryCosts: Map[Option[UsageRightsCategory], Cost] = Map(
    None                  -> Pay,
    Some(Handout)         -> Free,
    Some(Screengrab)      -> Free,
    Some(PrImage)         -> Conditional,
    Some(GuardianWitness) -> Conditional,
    Some(SocialMedia)     -> Conditional,
    Some(Obituary)        -> Conditional
  )

}
