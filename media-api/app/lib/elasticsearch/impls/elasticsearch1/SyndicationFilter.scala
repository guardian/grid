package lib.elasticsearch.impls.elasticsearch1

import com.gu.mediaservice.lib.elasticsearch.ImageFields
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.usage.SyndicationUsage
import lib.MediaApiConfig
import org.elasticsearch.index.query.FilterBuilder
import org.joda.time.DateTime

object SyndicationFilter extends ImageFields {
  private def syndicationRightsAcquired(acquired: Boolean): FilterBuilder = filters.boolTerm(
    field = "syndicationRights.rights.acquired",
    value = acquired
  )

  private val noRightsAcquired: FilterBuilder = filters.or(
    filters.existsOrMissing("syndicationRights.rights.acquired", exists = false),
    syndicationRightsAcquired(false)
  )

  private val hasRightsAcquired: FilterBuilder = filters.bool.must(
    syndicationRightsAcquired(true)
  )

  private val hasAllowLease: FilterBuilder = filters.term(
    "leases.leases.access",
    AllowSyndicationLease.name
  )

  private val hasDenyLease: FilterBuilder = filters.term(
    "leases.leases.access",
    DenySyndicationLease.name
  )

  private val hasSyndicationUsage: FilterBuilder = filters.term(
    "usages.platform",
    SyndicationUsage.toString
  )

  private val leaseHasStarted: FilterBuilder = filters.or(
    filters.existsOrMissing("leases.leases.startDate", exists = false),
    filters.date("leases.leases.startDate", None, Some(DateTime.now)).get
  )

  private val leaseHasEnded: FilterBuilder = filters.or(
    filters.existsOrMissing("leases.leases.endDate", exists = false),
    filters.date("leases.leases.endDate", Some(DateTime.now), None).get
  )

  private val syndicationRightsPublished: FilterBuilder = filters.or(
    filters.existsOrMissing("syndicationRights.published", exists = false),
    filters.date("syndicationRights.published", None, Some(DateTime.now)).get
  )

  private val syndicationStartDateFilter: FilterBuilder = {
    // syndication starts on 23 August 2018 as that's when training had been completed
    // don't show images uploaded prior to this date to keep the review queue manageable
    // for Editorial by not showing past images that RCS has told us about (~5k images)
    // TODO move this to config?
    val startDate = new DateTime()
      .withYear(2018)
      .withMonthOfYear(8)
      .withDayOfMonth(23)
      .withTimeAtStartOfDay()

    filters.date("uploadTime", Some(startDate), None).get
  }

  private val illustratorFilter: FilterBuilder = filters.or(
    filters.term(usageRightsField("category"), ContractIllustrator.category),
    filters.term(usageRightsField("category"), StaffIllustrator.category),
    filters.term(usageRightsField("category"), CommissionedIllustrator.category)
  )

  def statusFilter(status: SyndicationStatus, config: MediaApiConfig): FilterBuilder = status match {
    case SentForSyndication => filters.and(
      hasRightsAcquired,
      hasAllowLease,
      hasSyndicationUsage
    )
    case QueuedForSyndication => filters.and(
      hasRightsAcquired,
      filters.bool.mustNot(hasSyndicationUsage),
      filters.and(
        hasAllowLease,
        leaseHasStarted,
        syndicationRightsPublished
      )
    )
    case BlockedForSyndication => filters.and(
      hasRightsAcquired,
      hasDenyLease
    )
    case AwaitingReviewForSyndication => {
      val rightsAcquiredNoLeaseFilter = filters.and(
        hasRightsAcquired,
        filters.bool.mustNot(
          illustratorFilter,
          hasAllowLease,
          filters.and(
            hasDenyLease,
            leaseHasEnded
          )
        )
      )

      if (config.isProd) {
        filters.and(
          syndicationStartDateFilter,
          rightsAcquiredNoLeaseFilter
        )
      } else {
        rightsAcquiredNoLeaseFilter
      }
    }
    case UnsuitableForSyndication => noRightsAcquired
  }
}
