package com.gu.mediaservice.lib.config

import com.gu.mediaservice.lib.cleanup.ReapableEligibiltyResources
import com.gu.mediaservice.lib.elasticsearch.ReapableEligibility

object ReapableEligibilityLoader extends ProviderLoader[ReapableEligibility, ReapableEligibiltyResources]("Reapable Eligibility")
